import { GenerationManager, IndexAndGeneration } from "./generation-manager.js";


type Registry = {
    [key: string]: () => any
};

class ComponentRegistry {
    #registry: Registry;
    #world: { [key: string]: [] };
    #componentNames: string[];

    constructor(registry: Registry, world: { [key: string]: [] }, componentNames: string[]) {
        this.#registry = registry;
        this.#world = world;
        this.#componentNames = componentNames;
    }

    registerComponent(name: string, initFunc: () => any) {
        if (!(name in this.#world)) {
            this.#world[name] = [];
            this.#registry[name] = initFunc;
            this.#componentNames.push(name);
        }
    }
}

// 24 bits for generation
const GENERATION_MASK = 0xFFFFFF << 28;
// 28 for index
const INDEX_MASK = 0xFFFFFFF;

// 24 bits for generation, 28 for index
function idToCompactId(index: number, generation: number): number {
    return ((generation << 28) & GENERATION_MASK) | (index & INDEX_MASK);
}

function compactIdToId(id: number): IndexAndGeneration {
    return {
        index: id & INDEX_MASK,
        generation: (id & GENERATION_MASK) >> 28
    };
}

class World {
    gens: GenerationManager;
    registry: Registry;
    world: { [component: string]: any[] };
    componentNames: string[] = [];
    queryCache: {
        [componentBitmap: string]: Set<number>
    } = {};

    constructor(registerComponents: (registry: ComponentRegistry) => void) {
        let registry = {};
        let world = {};
        let componentNames: string[] = [];

        registerComponents(new ComponentRegistry(registry, world, componentNames));

        this.registry = registry;
        this.gens = new GenerationManager(Object.keys(registry).length);
        this.world = world;
        this.componentNames = componentNames;
    }

    calculateComponentBitflags(components: string[]): number[] {
        // LSB
        let result = (new Array(this.gens.componentNumsNeeded)).fill(0);

        for (let component of components) {
            const indexInComponents = this.componentNames.indexOf(component);

            if (indexInComponents !== -1) {
                result[Math.floor(indexInComponents / 32)] |= 1 << (indexInComponents % 32);
            }
        }

        return result;
    }

    check(id: IndexAndGeneration) {
        return this.gens.check(id);
    }

    createEntity(components: { [key: string]: any }) {
        const openSpot = this.gens.getOpen();

        for (let componentName in this.world) {
            if (componentName in components) {
                const defaultValue = this.registry[componentName]();
                let newComponentInstance;

                if (typeof defaultValue === "object") {
                    newComponentInstance = Object.assign(defaultValue, components[componentName]);
                } else {
                    newComponentInstance = components[componentName];
                }

                this.world[componentName][openSpot.index] = newComponentInstance;
            } else {
                this.world[componentName][openSpot.index] = null;
            }
        }

        const bitflags = this.calculateComponentBitflags(Object.keys(components));
        this.gens.setBitflags(openSpot, bitflags);

        // check if this new entity should be tracked in any of the caches
        for (let queryStr in this.queryCache) {
            let query = queryStr.split(",").map(x => parseInt(x));

            let matches = true;
            for (let j = 0; j < this.gens.componentNumsNeeded; j++) {
                if ((bitflags[j] & query[j]) !== query[j]) {
                    matches = false;
                    break;
                }
            }

            if (matches) {
                this.queryCache[queryStr].add(idToCompactId(openSpot.index, openSpot.generation));
            }
        }

        return openSpot;
    }

    removeEntity(id: IndexAndGeneration) {
        const wasRemoved = this.gens.remove(id);

        if (wasRemoved) {
            const { index, generation } = id;

            for (let component in this.world) {
                this.world[component][index] = null;
            }

            // remove entity from all caches
            const toRemove = idToCompactId(index, generation);

            for (let queryKey in this.queryCache) {
                this.queryCache[queryKey].delete(toRemove);
            }
        }

        return wasRemoved;
    }

    *query(query: number[]) {
        const componentNumsNeeded = this.gens.componentNumsNeeded;

        for (let i = 0; i < this.gens.len(); i++) {
            if (this.gens.isTaken(i)) {
                // it's taken, so let's check the bitflags
                let matches = true;

                for (let j = 0; j < componentNumsNeeded; j++) {
                    const componentFlag = this.gens.generations[i * this.gens.alignment + 1 + j] as number;

                    if ((componentFlag & query[j]) !== query[j]) {
                        matches = false;
                        break;
                    }
                }

                if (matches) {
                    yield i;
                }
            }
        }
    }

    *cachedQuery(bitflags: number[]) {
        const queryKey = bitflags.join(",");

        if (this.queryCache[queryKey]) {
            const cache = this.queryCache[queryKey];

            for (let compactId of cache) {
                yield compactId & INDEX_MASK;
            }
        } else {
            let newCache: Set<number> = new Set();

            for (let index of this.query(bitflags)) {
                newCache.add(idToCompactId(index, this.gens.generation(index)));

                yield index;
            }

            this.queryCache[queryKey] = newCache;
        }
    }
}

export { World };