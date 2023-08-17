const { readMemory, move } = require('../util');
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Vec3 = require('vec3').Vec3;

class Goto {
    
    constructor(extras) {
        this.extras = extras;
    }

    description() {
        if (this.extras.waypoint) {
            return "go to " + this.extras.waypoint ?? this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z
        } else {
            return "go to " + this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z
        }
    }

    extras = {
        x: null,
        y: null,
        z: null,
        waypoint: null
    }

    async enter(stateMachine, bot) {
        const waypoints = (await readMemory()).waypoints;
        const waypointObject = waypoints[this.extras.waypoint];
        const coordinates = this.extras.coordinates ?? {};
        if (waypointObject) {
            if (waypointObject.dimension != bot.game.dimension) {
                bot.chat("Whoa! That's in the " + waypointObject.dimension.replace("the_", "") + ", I'm in the " + bot.game.dimension.replace("the_", ""))
            } else {
                coordinates.x = waypointObject.x
                coordinates.y = waypointObject.y
                coordinates.z = waypointObject.z
            }
        }
        console.log("Entered GoTo state with coords: " + coordinates.x + " " + coordinates.y + " " + coordinates.z);

        await move(bot, new Vec3(coordinates.x, coordinates.y, coordinates.z), 0)
    }

    async exit(stateMachine, bot) {
        console.log("Exited GoTo state");
        bot.pathfinder.stop();
    }

    async movingFinished(stateMachine, bot) {
        await stateMachine.pop();
    }
}

module.exports = { Goto };