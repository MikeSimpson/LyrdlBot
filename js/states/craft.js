class Craft {
    
    constructor(extras) {
        this.extras = extras
    }
    
    description() { return "craft " + this.extras.item }

    extras = {
        item: null
    }

    outerStateMachine = null

    async enter(stateMachine, bot) {
        this.outerStateMachine = stateMachine
        this.stateMachine.start(new PlaceBench(this))
    }

    async exit(stateMachine, bot) {
        if (this.stateMachine.currentState().exit) {
            this.stateMachine.currentState().exit(stateMachine, bot)
        }
        this.stateMachine.clear()
    }
}

class PlaceBench {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username

        await this.parent.stateMachine.transition(new CraftItem(this.parent))
    }

    async exit(stateMachine, bot) {
    }
}

class CraftItem {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username

        await this.parent.stateMachine.transition(new CollectBench(this.parent))
    }

    async exit(stateMachine, bot) {
    }
}

class CollectBench {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username

        await this.parent.outerStateMachine.pop()
    }

    async exit(stateMachine, bot) {
    }
}

module.exports = { Craft }