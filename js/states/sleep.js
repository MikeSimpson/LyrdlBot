const { botCreator } = require('../botCreator')

class Sleep {
    description() { return "sleep" }

    stateMachine = null

    async enter(stateMachine, bot) {
        this.stateMachine.start(new SleepStart(this))
    }

    async exit(stateMachine, bot) {
        if (this.stateMachine.currentState().exit) {
            this.stateMachine.currentState().exit(stateMachine, bot)
        }
    }

    async shouldWake(stateMachine, bot) {
        this.stateMachine.transition(new WakeUp())
    }

    async sleep(stateMachine, bot) {
        this.stateMachine.transition(new Sleeping())
    }

    async wake(stateMachine, bot) {
        await stateMachine.pop()
    }

}

class SleepStart {
    constructor(parent){
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        // Find a bed
        const bed = bot.findBlock({
            matching: (block) => {
                return bot.isABed(block)
            }
        })
        try {
            // Make sure we set spawn point
            bot.activateBlock(bed)
            await bot.sleep(bed)
        } catch (error) {
            console.log("Dimension: "+bot.game.dimension)
            if (bot.game.dimension == 'overworld') {
                // Log off for five seconds
                bot.quit("Logging Off to pass the night")
                setTimeout(() => { botCreator.createBot() }, 10000)
            }

            await stateMachine.pop()
            // "Can only sleep at night or during thunderstorm"
            console.log(error)
        }
    }
}

// All transitions to and from this state are driven by events
class Sleeping {}

class WakeUp {
    async enter(stateMachine, bot) {
        bot.wake()
    }
}

module.exports = { Sleep }