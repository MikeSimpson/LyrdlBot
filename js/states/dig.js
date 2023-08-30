const { readMemory, move } = require('../util')
const Vec3 = require('vec3').Vec3

class Dig {

    constructor(extras) {
        this.extras = extras
    }

    description() {
        return "dig block at " + this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z
    }

    extras = {
        coordinates: null,
        scaffold: null
    }

    outerStateMachine = null

    async enter(stateMachine, bot) {
        this.outerStateMachine = stateMachine
        await this.stateMachine.start(new DigGoto(this))
    }

    async exit(stateMachine, bot) {
        bot.pathfinder.stop()
    }

    async movingFinished(stateMachine, bot) {
        await this.stateMachine.transition(new Digging(this))
    }
}

class DigGoto {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {

        await move(bot, new Vec3(this.parent.extras.coordinates.x, this.parent.extras.coordinates.y, this.parent.extras.coordinates.z), 4, this.parent.extras.scaffold)
    }

    async exit(stateMachine, bot) {
        bot.pathfinder.stop()
    }
}

class Digging {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const block = bot.blockAt(new Vec3(this.parent.extras.coordinates.x, this.parent.extras.coordinates.y, this.parent.extras.coordinates.z))
        if (block && bot.canDigBlock(block) && block.name != "air") {
            try {  
                await bot.tool.equipForBlock(block, {})
                await bot.dig(block)
            } catch (err) {
                console.log(err.stack)
            }
        }
        await this.parent.outerStateMachine.pop()
    }
}

module.exports = { Dig }