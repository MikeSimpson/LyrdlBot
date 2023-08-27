class Push {
    
    description() { return "push button" }

    async enter(stateMachine, bot) {
        console.log("Entered Push state");
        const button = bot.findBlock({
            matching: (block) => {
                return block.name.includes("button")
            }
        })
        await bot.activateBlock(button);
        await stateMachine.pop();
    }

    async exit(stateMachine, bot) {
        console.log("Exited Push state");
    }
}

module.exports = { Push };