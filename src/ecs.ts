import { GenerationManager, IndexAndGeneration } from "../generation-manager.js";


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

class World {
    gens: GenerationManager;
    registry: Registry;
    world: { [key: string]: any[] };
    componentNames: string[] = [];

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
                result[Math.floor(indexInComponents / 52)] |= 1 << (indexInComponents % 52);
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

        return openSpot;
    }

    removeEntity(indexAndGen: IndexAndGeneration) {
        let wasRemoved = this.gens.remove(indexAndGen);

        if (wasRemoved) {
            const { index } = indexAndGen;

            for (let component in this.world) {
                this.world[component][index] = null;
            }
        }

        return wasRemoved;
    }

    *query(bitflags: number[]) {
        for (let i = 0; i < this.gens.len(); i++) {
            if (this.gens.isTaken(i)) {
                // it's taken, so let's check the bitflags
                let matches = true;

                for (let j = 0; j < this.gens.componentNumsNeeded; j++) {
                    const componentFlag = this.gens.generations[i * this.gens.alignment + 1 + j] as number;

                    if ((componentFlag & bitflags[j]) !== bitflags[j]) {
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
}

export { World };