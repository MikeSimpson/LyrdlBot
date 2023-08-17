class Wait {
    
    constructor(extras) {
        this.extras = extras;
    }

    description() { return "wait for " + this.extras.ticks + " ticks" }

    extras = {
        ticks: 0
    }

    async enter(stateMachine, bot) {
        console.log("Entered Wait state for ticks: " + this.extras.ticks);
        // Bob up and down to show state and keep from being kicked
        var sneak = false;
        var ticksElapsed = 0;
        while (stateMachine.currentState() === this && ticksElapsed < this.extras.ticks) {
            bot.setControlState('sneak', sneak);
            sneak = !sneak;
            let t = sneak ? 30 : 5;
            ticksElapsed += t;
            await bot.waitForTicks(t);
        }
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Wait state");
        bot.setControlState('sneak', false);
    }
}

module.exports = { Wait };