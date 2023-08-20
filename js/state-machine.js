const { Idle } = require('./states/idle');

// A class to hold the current state and handle state transitions
class StateMachine {
    
    stateStack = [];

    setBot(bot) {
        this.bot = bot;
    }

    currentState() {
        return this.stateStack[this.stateStack.length - 1]
    }

    async start(initialState) {
        this.stateStack.push(initialState);
        initialState.stateMachine = new StateMachine();
        initialState.stateMachine.setBot(this.bot);
        await this.currentState().enter(this, this.bot);
    }

    async transition(newState) {
        await this.currentState().exit(this, this.bot);
        newState.stateMachine = new StateMachine();
        newState.stateMachine.setBot(this.bot);
        this.stateStack.push(newState);
        await this.currentState().enter(this, this.bot);
    }

    async clear() {
        await this.currentState().exit(this, this.bot);
        this.stateStack = [new Idle()];
    }

    async push(newState) {
        newState.stateMachine = new StateMachine();
        newState.stateMachine.setBot(this.bot);
        this.stateStack.push(newState);
    }

    async pop() {
        await this.currentState().exit(this, this.bot);
        this.stateStack.pop();
        if (!this.currentState()) {
            this.stateStack.push(new Idle());
        }
        if (this.currentState().resume) {
            await this.currentState().resume();
        } else {
            await this.currentState().enter(this, this.bot);
        }
    }
}

module.exports = { StateMachine };