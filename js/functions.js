
const { getStatus, updateMemory, readMemory } = require('./util');
const { Follow } = require('./states/follow');
const { Idle } = require('./states/idle');
const { Ride } = require('./states/ride');
const { Sleep } = require('./states/sleep');
const { Mission } = require('./states/mission');
const { Step } = require('./states/step');
const { Deposit } = require('./states/deposit');
const { Take } = require('./states/take');
const { Wait } = require('./states/wait');
const { Goto } = require('./states/goto');
const { Attack } = require('./states/attack');
const { Guard } = require('./states/guard');
const { Drop } = require('./states/drop');
const { Push } = require('./states/push');
const { Dig } = require('./states/dig');
const { Trench } = require('./states/trench');

async function processFunction(command, stateMachine, bot) {
    let response = null;
    switch (command.name) {
        case "follow":
            stateMachine.clear();
            stateMachine.transition(new Follow(command.parameters));
            response = "Following";
            break;
        case "attack":
            stateMachine.clear();
            stateMachine.transition(new Attack(command.parameters));
            response = "Attacking";
            break;
        case "guard":
            stateMachine.clear();
            stateMachine.transition(new Guard(command.parameters ?? {}));
            response = "Guarding";
            break;
        case "stop":
            stateMachine.clear();
            stateMachine.transition(new Idle());
            response = "Stopping";
            break;
        case "push":
            stateMachine.transition(new Push());
            response = "Pushing";
            break;
        case "get_in":
            stateMachine.transition(new Ride());
            response = "Getting in";
            break;
        case "get_out":
            if (stateMachine.currentState().shouldDismount) {
                stateMachine.currentState().shouldDismount();
            }
            response = "Getting out";
            break;
        case "sleep":
            stateMachine.transition(new Sleep());
            response = "Sleeping";
            break;
        case "wake":
            if (stateMachine.currentState().shouldWake) {
                stateMachine.currentState().shouldWake();
            }
            response = "Waking";
            break;
        case "step":
            stateMachine.transition(new Step(command.parameters));
            response = "Stepping";
            break;
        case "mission":
            stateMachine.clear();
            stateMachine.transition(new Mission(command.parameters));
            response = "Starting " + command.parameters.missionName + " mission";
            break;
        case "goto":
            stateMachine.clear();
            stateMachine.transition(new Goto(command.parameters));
            response = "Going to  " + (command.parameters.waypoint ?? "coordinates");
            break;
        case "trench":
            stateMachine.clear();
            stateMachine.transition(new Trench(command.parameters));
            response = "Trenching";
            break;
        case "dig":
            stateMachine.transition(new Dig(command.parameters));
            response = "Digging";
            break;
        case "take":
            stateMachine.transition(new Take(command.parameters));
            response = "Taking";
            break;
        case "deposit":
            stateMachine.transition(new Deposit(command.parameters));
            response = "Depositing";
            break;
        case "drop":
            stateMachine.transition(new Drop(command.parameters));
            response = "Dropping";
            break;
        case "wait":
            stateMachine.transition(new Wait(command.parameters));
            response = "Waiting";
            break;
        case "save_waypoint":
            try {
                const coordinates = command.parameters.coordinates ? command.parameters.coordinates : bot.entity.position;
                const waypoint = {
                    x: coordinates.x,
                    y: coordinates.y,
                    z: coordinates.z,
                    dimension: command.parameters.dimension, //todo
                    description: command.parameters.description ?? ""
                }
                updateMemory((memory) => {
                    memory.waypoints[command.parameters.name] = waypoint;
                    return memory
                })
            } catch (error) {
                console.log(error)
            }
            response = "Saved waypoint";
            break;
        case "feature_request":
            try {
                updateMemory((memory) => {
                    memory.feature_requests.push(command.parameters);
                    return memory
                })
            } catch (error) {
                console.log(error)
            }
            response = "Recorded feature request to " + command.parameters.description;
            break;
        // For bypass commands
        case "up_2":
            bot.chat("My current task is to " + stateMachine.currentState().description())
            break;
        case "@":
            const p = bot.entity.position;
            bot.chat("I'm at " + Math.round(p.x) + " " + Math.round(p.y) + " " + Math.round(p.z) + " in the " + bot.game.dimension.replace("the_", ""));
            break;
        case "get_status":
            async function reportStatus() {
                const status = await getStatus(stateMachine, bot);
                return `You are operating at ${status.efficiency} efficiency, your power level is ${status.powerLevel}, your location is ${status.location.x} ${status.location.y} ${status.location.z} in ${status.location.dimension} and your current task is ${status.task}`;
            }
            response = reportStatus();
            break;
        case "get_waypoints":
            async function reportWaypoints() {
                const waypoints = Object.keys((await readMemory()).waypoints);
                return `These are the available waypoints, please list them in a single line ${waypoints}`;
            }
            response = reportWaypoints();
            break;
    }
    return response;
}

module.exports = { processFunction };