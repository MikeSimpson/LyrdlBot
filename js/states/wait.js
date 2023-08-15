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
        await bot.waitForTicks(this.extras.ticks)
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Wait state");
    }
}

module.exports = { Wait };