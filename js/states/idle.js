class Idle {
    description() { return "idle" }

    async enter(stateMachine, bot) {
        // Bob up and down to show state and keep from being kicked
        var sneak = false
        while (stateMachine.currentState() === this) {
            bot.setControlState('sneak', sneak)
            sneak = !sneak
            await bot.waitForTicks(sneak ? 30 : 5)
        }
    }
    
    async exit(stateMachine, bot) {
        bot.setControlState('sneak', false)
    }
}

module.exports = { Idle }