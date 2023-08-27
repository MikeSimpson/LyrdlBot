const { readMemory, move } = require('../util');
const Vec3 = require('vec3').Vec3;

class Dig {

    constructor(extras) {
        this.extras = extras;
    }

    description() {
        return "dig block at " + this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z
    }

    extras = {
        coordinates: null
    }

    outerStateMachine = null;

    async enter(stateMachine, bot) {
        console.log("Entered Dig state: " + this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z);
        this.outerStateMachine = stateMachine;
        await this.stateMachine.start(new DigGoto(this));
    }

    async exit(stateMachine, bot) {
        console.log("Exited Dig state");
        bot.pathfinder.stop();
    }

    async movingFinished(stateMachine, bot) {
        await this.stateMachine.transition(new Digging(this));
    }
}

class DigGoto {
    constructor(parent) {
        this.parent = parent;
    }

    async enter(stateMachine, bot) {
        console.log("Entered DigGoto state with coords: " + this.parent.extras.coordinates.x + " " + this.parent.extras.coordinates.y + " " + this.parent.extras.coordinates.z);

        await move(bot, new Vec3(this.parent.extras.coordinates.x, this.parent.extras.coordinates.y, this.parent.extras.coordinates.z), 4)
    }

    async exit(stateMachine, bot) {
        console.log("Exited DigGoto state");
        bot.pathfinder.stop();
    }
}

class Digging {
    constructor(parent) {
        this.parent = parent;
    }

    async enter(stateMachine, bot) {
        console.log("Entered Digging state");
        const block = bot.blockAt(new Vec3(this.parent.extras.coordinates.x, this.parent.extras.coordinates.y, this.parent.extras.coordinates.z));
        if (block && bot.canDigBlock(block) && block.name != "air") {
            try {  
                await bot.tool.equipForBlock(block, {})
                await bot.dig(block)
            } catch (err) {
                console.log(err.stack)
            }
        }
        await this.parent.outerStateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Digging state");
    }
}

module.exports = { Dig };