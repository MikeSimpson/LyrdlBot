class Sleep {
    description() { return "sleep" }

    stateMachine = null;

    async enter(stateMachine, bot) {
        console.log("Entered Sleep state");
        this.stateMachine.start(new SleepStart());
    }

    async exit(stateMachine, bot) {
        console.log("Exited Sleep state");
        this.stateMachine.currentState().exit(stateMachine, bot);
    }

    async shouldWake(stateMachine, bot) {
        this.stateMachine.transition(new WakeUp());
    }

    async sleep(stateMachine, bot) {
        this.stateMachine.transition(new Sleeping());
    }

    async wake(stateMachine, bot) {
        await stateMachine.pop();
    }

}
class SleepStart {
    async enter(stateMachine, bot) {
        console.log("Entered Sleeping state");
        // Find a bed
        const bed = bot.findBlock({
            matching: (block) => {
                return bot.isABed(block)
            }
        })
        try {
            if (bed) {
                // Make sure we set spawn point
                bot.activateBlock(bed);
                await bot.sleep(bed);
            } else {
                bot.chat("Oh woops, I can't find a bed!")
                await stateMachine.pop();
            }
        } catch (error) {
            // "Can only sleep at night or during thunderstorm"
            console.log(error)
        }
    }
    async exit(stateMachine, bot) {
        console.log("Exited Sleeping state");
    }
}

// All transitions to and from this state are driven by events
class Sleeping {
    async enter(stateMachine, bot) {
        console.log("Entered Sleeping state");
    }
    async exit(stateMachine, bot) {
        console.log("Exited Sleeping state");
    }
}

class WakeUp {
    async enter(stateMachine, bot) {
        console.log("Entered WakeUp state");
        bot.wake()
    }
    async exit(stateMachine, bot) {
        console.log("Exited WakeUp state");
    }
}

module.exports = { Sleep };