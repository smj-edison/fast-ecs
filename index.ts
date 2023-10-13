// import { World } from "./ecs";
var World = (await import("./src/ecs.js")).World;

var world = new World(registry => {
    registry.registerComponent("name", () => "");
    registry.registerComponent("position", () => ({ x: 0, y: 0 }));
    registry.registerComponent("size", () => ({ width: 0, height: 0 }));

    for (let i = 0; i < 100; i++) {
        registry.registerComponent("component" + i, () => 0);
    }
});

var entity1 = world.createEntity({
    position: { x: 100, y: 100 },
    size: { width: 10, height: 10 },
    component62: 0,
});

// console.assert(world.removeEntity(entity1) === true);

var entity2 = world.createEntity({
    position: { x: 50, y: 50 },
});

var query = world.calculateComponentBitflags(["component62"]);
console.log("query", query);

var iter = world.query(query);

for (let index of iter) {

}