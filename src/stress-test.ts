import { World } from "./ecs.js";

const COMPONENT_COUNT = 300;
const INITIAL_ENTITY_COUNT = 1000;
const SYSTEM_COUNT = 200;

const world = new World(registry => {
    for (let i = 0; i < COMPONENT_COUNT; i++) {
        registry.registerComponent("component" + i, () => ({ x: 0, y: 0 }));
    }
});

function start() {
    performance.mark("start");
}

var uid = 0;
function end(multiplier = 1): string {
    let measurementName = (uid++) + "";

    performance.mark("end");
    performance.measure(measurementName, "start", "end");

    return (performance.getEntriesByName(measurementName)[0].duration * multiplier).toFixed(3) + "ms";
}

// https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
function guassianRand() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();

    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    num = num / 10.0 + 0.5; // Translate to 0 -> 1

    if (num > 1 || num < 0) return guassianRand(); // resample between 0 and 1

    return num;
}

let entityTemplates: any[] = [];
for (let i = 0; i < INITIAL_ENTITY_COUNT; i++) {
    let numOfComponents = Math.floor(Math.random() * 30 + 1);

    entityTemplates.push({});

    for (let j = 0; j < numOfComponents; j++) {
        let componentToSelect = Math.floor(guassianRand() * COMPONENT_COUNT);

        entityTemplates[i]["component" + componentToSelect] = {
            x: Math.floor(Math.random() * 10 - 5),
            y: Math.floor(Math.random() * 10 - 5)
        };
    }
}

let megaEntity: any = {};
for (let i = 0; i < COMPONENT_COUNT; i++) {
    megaEntity["component" + i] = {
        x: Math.floor(Math.random() * 10 - 5),
        y: Math.floor(Math.random() * 10 - 5)
    };
}

entityTemplates.push(megaEntity);

console.log(`Using ${COMPONENT_COUNT} components`);

// PROFILE INSERTION
start();

let indexes = [];
for (let i = 0; i < entityTemplates.length; i++) {
    indexes.push(world.createEntity(entityTemplates[i]));
}

console.log(`Time to insert ${INITIAL_ENTITY_COUNT} entities: ${end()}`);


// PROFILE REMOVAL
start();

for (let i = 0; i < indexes.length; i++) {
    world.removeEntity(indexes[i]);
}

console.log(`Time to remove ${INITIAL_ENTITY_COUNT} entities: ${end()}`);


// PROFILE RE-INSERTION
indexes.length = 0;
start();

for (let i = 0; i < entityTemplates.length; i++) {
    indexes.push(world.createEntity(entityTemplates[i]));
}

console.log(`Time to reinsert ${INITIAL_ENTITY_COUNT} entities: ${end()}`);



// QUERYING
// DENSE QUERY WARMUP
for (let i = 0; i < 1000; i++) {
    const query = world.calculateComponentBitflags(["component1", "component2"]);

    for (let index of world.query(query)) {
        world.world["component1"][index].x += 1;
        world.world["component2"][index].y += 1;
    }
}

// PROFILE DENSE QUERY
{
    let queries = [];
    let bitflags = [];

    for (let i = 0; i < SYSTEM_COUNT; i++) {
        const newQuery = [];

        for (let j = 0; j < Math.max(guassianRand() - 0.5, 0) * 2 * 20; j++) {
            newQuery.push("component" + Math.floor(Math.random() * (COMPONENT_COUNT - 4) + 2));
        }

        if (newQuery.length === 0) continue;

        queries.push(newQuery);
        bitflags.push(world.calculateComponentBitflags(newQuery));

        let iter = world.cachedQuery(world.calculateComponentBitflags(newQuery));
        while (!iter.next().done);
    }

    start();
    for (let i = 0; i < queries.length; i++) {
        for (let index of world.query(bitflags[i])) {
            for (let component of queries[i]) {
                world.world[component][index].x += 1;
            }
        }
    }

    console.log(`Single dense query pass (${SYSTEM_COUNT} systems): ${end()}`);

    start();
    for (let i = 0; i < queries.length; i++) {
        for (let index of world.cachedQuery(bitflags[i])) {
            for (let component of queries[i]) {
                world.world[component][index].x += 1;
            }
        }
    }

    console.log(`Single dense query pass, cached (${SYSTEM_COUNT} systems): ${end()}`);
}


// COMPARE DENSE AND SPARSE QUERY //

{
    // cache the query
    const queryingFor = "component" + Math.floor(COMPONENT_COUNT * 0.20);
    const bitflags = world.calculateComponentBitflags([queryingFor]);

    let iter = world.cachedQuery(bitflags);
    while (!iter.next().done);

    console.log(`# of ${queryingFor}: ${world.world[queryingFor].reduce((acc, val) => {
        return acc + (val === null ? 0 : 1);
    }, 0)
        }`);

    start();
    for (let i = 0; i < 100; i++) {
        for (let index of world.cachedQuery(bitflags)) {
            world.world[queryingFor][index].x += 1;
        }
    }
    console.log(`Single pass of cached: ${end(1 / 100)}`);

    start();
    for (let i = 0; i < 100; i++) {
        for (let index of world.query(bitflags)) {
            world.world[queryingFor][index].x += 1;
        }
    }
    console.log(`Single pass of normal: ${end(1 / 100)}`);
}

// insert after query caches are established
{
    start();

    for (let i = 0; i < INITIAL_ENTITY_COUNT; i++) {
        indexes.push(world.createEntity(entityTemplates[i]));
    }

    console.log(`Time to insert ${INITIAL_ENTITY_COUNT} entities after establishing caches: ${end()}`);
}