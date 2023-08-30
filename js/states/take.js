const { takeAll } = require('../util')
const Vec3 = require('vec3').Vec3

class Take {

    constructor(extras) {
        this.extras = extras ?? this.extras
    }

    description() { return "take items from a chest" }

    extras = {
        regex: null,
        position: null
    }

    async enter(stateMachine, bot) {
        // take all items from nearest chest
        if (this.extras.position) {
            const chest = bot.blockAt(new Vec3(this.extras.position.x, this.extras.position.y, this.extras.position.z))
            await takeAll(bot, chest, this.extras.regex)
        } else {
            const chests = bot.findBlocks({
                matching: ['chest', 'barrel'].map(name => bot.registry.blocksByName[name].id),
                maxDistance: 6,
                count: 4
            })

            for (const at of chests.slice(0, 4)) {
                const chest = bot.blockAt(at)
                await takeAll(bot, chest, this.extras.regex)
            }
        }

        await stateMachine.pop()
    }
}

module.exports = { Take }