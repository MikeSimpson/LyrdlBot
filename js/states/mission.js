const { readMemory } = require('../util');

const { Follow } = require('./follow');
const { Idle } = require('./idle');
const { Ride } = require('./ride');
const { Sleep } = require('./sleep');
const { Step } = require('./step');
const { Deposit } = require('./deposit');
const { Take } = require('./take');
const { Wait } = require('./wait');
const { Goto } = require('./goto');

class Mission {

    constructor(extras) {
        this.extras = extras;
    }

    description() { return "doing the " + this.extras.missionName + " mission" }

    async enter(stateMachine, bot) {
        console.log("Entered Mission " + this.extras.missionName);
        const missions = (await readMemory()).missions;
        const mission = missions[this.extras.missionName];

        if (mission.looping) {
            stateMachine.push(new Mission(this.extras));
        }
        for (const step of mission.steps) {
            console.log("Pushing " + JSON.stringify(step))
            await stateMachine.push(this.getState(step.state, step.parameters));
        }
        // start mission
        await stateMachine.currentState().enter(stateMachine, bot);
    }

    async exit(stateMachine, bot) {
        console.log("Exited Mission state");
    }

    extras = {
        looping: false,
        missionName: null
    }

    getState(name, extras) {
        switch (name) {
            case "Step":
                return new Step(extras);
        }
    }
}

module.exports = { Mission };