class Push {
    
    description() { return "push button" }

    async enter(stateMachine, bot) {
        const button = bot.findBlock({
            matching: (block) => {
                return block.name.includes("button")
            }
        })
        await bot.activateBlock(button)
        await stateMachine.pop()
    }
}

module.exports = { Push }