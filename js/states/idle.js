class Idle {
    description() { return "chill" }

    async enter(stateMachine, bot) {
        console.log("Entered Idle state");

        // Bob up and down to show state and keep from being kicked
        var sneak = false
        while (stateMachine.currentState() === this) {
            bot.setControlState('sneak', sneak)
            sneak = !sneak
            await bot.waitForTicks(sneak ? 30 : 5)
        }
    }
    
    async exit(stateMachine, bot) {
        console.log("Exited Idle state");
        bot.setControlState('sneak', false)
    }
}

module.exports = { Idle };