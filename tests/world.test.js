import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, distanceMap, keyOf, roadAt, createActor, moveActor, reverseActor } from '../src/world.js';

test('every flag, fuel pickup and enemy is reachable without crossing roadblocks for 100 rounds', () => {
  for(let round=1;round<=100;round++){
    const world=createWorld(round);
    const reachable=distanceMap(world.grid,world.spawn,new Set(world.obstacles.map(p=>keyOf(p.x,p.y))));
    assert.equal(reachable.size,world.roads.length-world.obstacles.length,`Disconnected round ${round}`);
    assert.equal(world.flags.length,10);
    assert.equal(world.flags.filter(f=>f.special).length,1);
    assert.equal(world.fuels.length,4);
    assert.ok(world.enemySpawns.length>=3);
    for(const point of [...world.flags,...world.fuels,...world.enemySpawns])assert.ok(reachable.has(keyOf(point.x,point.y)),`Unreachable ${JSON.stringify(point)} in round ${round}`);
    const pickups=[...world.flags,...world.fuels].map(p=>keyOf(p.x,p.y));
    assert.equal(new Set(pickups).size,pickups.length);
  }
});
test('rounds are deterministic and change layout between rounds',()=>{
  assert.deepEqual(createWorld(2).grid,createWorld(2).grid);
  assert.notDeepEqual(createWorld(1).grid,createWorld(2).grid);
});
test('movement stops at walls even with a large timestep',()=>{
  const grid=[[1,1,1,1,1],[1,0,0,0,1],[1,1,1,1,1]];
  const actor=createActor(1,1);
  moveActor(actor,4,1,grid,()=> 'right');
  assert.equal(actor.x,3);assert.equal(actor.y,1);assert.ok(roadAt(grid,actor.x,actor.y));
});
test('a queued turn is applied at the next junction without cutting through a wall',()=>{
  const grid=[[1,1,1,1,1],[1,0,0,0,1],[1,1,0,1,1],[1,1,0,1,1],[1,1,1,1,1]];
  const actor=createActor(1,1);
  moveActor(actor,2,1,grid,a=>roadAt(grid,a.fromX,a.fromY+1)?'down':'right');
  assert.equal(actor.x,2);assert.equal(actor.y,2);
});
test('reversing between junctions preserves position and returns along the same road',()=>{
  const grid=[[1,1,1,1],[1,0,0,1],[1,1,1,1]];
  const actor=createActor(1,1);
  moveActor(actor,1,.4,grid,()=> 'right');assert.equal(actor.x,1.4);
  reverseActor(actor);assert.equal(actor.x,1.4);
  moveActor(actor,1,.4,grid,()=> 'left');assert.equal(actor.x,1);assert.equal(actor.y,1);
});
