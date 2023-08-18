const { putAll } = require('../util');
const Vec3 = require('vec3').Vec3;

class Deposit {

    constructor(extras) {
        this.extras = extras ?? this.extras;
    }

    description() { return "dump items in a chest" }

    extras = {
        regex: null,
        position: null
    }

    async enter(stateMachine, bot) {
        console.log("Entered Deposit");
        // put all items in nearest chest
        if (this.extras.position) {
            const chest = bot.blockAt(new Vec3(this.extras.position.x, this.extras.position.y, this.extras.position.z))
            await takeAll(bot, chest, this.extras.regex);
        } else {
            const chests = bot.findBlocks({
                matching: ['chest', 'barrel'].map(name => bot.registry.blocksByName[name].id),
                maxDistance: 6,
                count: 4
            })

            console.log("Chests: " + chests);
            console.log("Slice: " + chests.slice(0,4));
            for (const at of chests.slice(0, 4)) {
                const chest = bot.blockAt(at);
                console.log("Depositing in chest: " + at);
                await putAll(bot, chest, this.extras.regex);
            }
        }
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Deposit state");
    }
}

module.exports = { Deposit };