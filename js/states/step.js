class Step {
    
    constructor(extras) {
        this.extras = extras;
    }
    
    description() { return "step " + this.extras.direction }

    extras = {
        direction: null
    }

    async enter(stateMachine, bot) {
        console.log("Entered Step state with direction: " + this.extras.direction);
        // Set a key, wait a bit, and release it
        bot.setControlState(this.extras.direction, true)
        await bot.waitForTicks(5)
        bot.setControlState(this.extras.direction, false)
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Step state");
    }
}

module.exports = { Step };