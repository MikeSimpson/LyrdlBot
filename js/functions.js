
const { getStatus } = require('./util');

const functions = [
    {
        "name": "other",
        "description": "Execute a command not listed here",
        "parameters": {
            "description": "The request"
        }
    },
    {
        "name": "nothing",
        "description": "Do nothing",
    },
    {
        "name": "follow",
        "description": "Make the robot follow the given player",
        "parameters": {
            "type": "object",
            "properties": {
                "username": {
                    "type": "string",
                    "description": "The username, e.g. Lyrdl"
                }
            },
            "required": ["username"],
        }
    },
    {
        "name": "stop",
        "description": "Make the robot return or remain in the idle state"
    },
    {
        "name": "get_in",
        "description": "Make the robot get in the nearest boat"
    },
    {
        "name": "get_out",
        "description": "Make the robot get out of a boat"
    },
    {
        "name": "step",
        "description": "Make the robot take a step in the given direction",
        "parameters": {
            "type": "object",
            "properties": {
                "direction": {
                    "type": "string",
                    "description": "The direction to step in",
                    "enum": ["forward", "back", "left", "right"]
                }
            },
            "required": ["direction"]
        }
    },
    {
        "name": "goto",
        "description": "Make the robot pathfind to the given coordinates or waypoint name",
        "parameters": {
            "type": "object",
            "properties": {
                "coordinates": {
                    "type": "object",
                    "description": "The coordinates x y and z e.g. 0 0 0",
                    "properties": {
                        "x": {
                            "type": "number",
                            "description": "The coordinate on the x axis"
                        },
                        "y": {
                            "type": "number",
                            "description": "The coordinate on the y axis"
                        },
                        "z": {
                            "type": "number",
                            "description": "The coordinate on the z axis"
                        }
                    }
                },
                "waypoint": {
                    "type": "string",
                    "description": "The name of the waypoint e.g. origin"
                }
            }
        }
    },
    {
        "name": "save_waypoint",
        "description": "Save a waypoint with the given name, coordinates, dimension and description",
        "parameters": {
            "type": "object",
            "properties": {
                "coordinates": {
                    "type": "object",
                    "description": "The coordinates x y and z e.g. 0 0 0",
                    "properties": {
                        "x": {
                            "type": "number",
                            "description": "The coordinate on the x axis"
                        },
                        "y": {
                            "type": "number",
                            "description": "The coordinate on the y axis"
                        },
                        "z": {
                            "type": "number",
                            "description": "The coordinate on the z axis"
                        }
                    }
                },
                "name": {
                    "type": "string",
                    "description": "The name of the waypoint e.g. origin"
                },
                "dimension": {
                    "type": "string",
                    "description": "The Minecraft dimension",
                    "enum": ["overworld", "the_nether", "the_end"]
                }
            },
            "required": ["coordinates", "name", "dimension"]
        }
    },
    {
        "name": "sleep",
        "description": "Make the robot sleep in the nearest bed"
    },
    {
        "name": "wake",
        "description": "Make the robot wake up"
    },
    {
        "name": "take",
        "description": "Make the robot take all items from the nearest chest"
    },
    {
        "name": "deposit",
        "description": "Make the robot deposit all items from the nearest chest"
    },
    {
        "name": "collect_gunpowder",
        "description": "Send the robot on a multi step mission to collect gunpowder",
        "parameters": {
            "type": "object",
            "properties": {
                "step": {
                    "type": "string",
                    "description": "The step of the mission to skip to (optional)"
                }
            }
        }
    },
    {
        "name": "mission",
        "description": "Start a custom mission",
        "parameters": {
            "type": "object",
            "properties": {
                "looping": {
                    "type": "bool",
                    "description": "Whether or not the mission should loop"
                },
                "mission": {
                    "type": "string",
                    "description": "The name of the mission",
                    "enum": ["test"]
                }
            },
            "required": ["mission"]
        }
    }
]

async function processFunction(response, stateMachine, bot) {
    switch (response.name) {
        case "follow":
            // TODO handle error and send LLM a message to correct it
            stateMachine.clear();
            stateMachine.transition(states.Follow, response.parameters);
            break;
        case "stop":
            stateMachine.clear();
            stateMachine.transition(states.Idle);
            break;
        case "get_in":
            stateMachine.transition(states.Ride);
            break;
        case "get_out":
            if (stateMachine.currentState().shouldDismount) {
                stateMachine.currentState().shouldDismount();
            }
            break;
        case "sleep":
            stateMachine.transition(states.Sleep);
            break;
        case "wake":
            if (stateMachine.currentState().shouldWake) {
                stateMachine.currentState().shouldWake();
            }
            break;
        case "step":
            stateMachine.transition(states.Step, response.parameters);
            break;
        case "gunpowder":
            stateMachine.clear();
            stateMachine.transition(states.Gunpowder, response.parameters);
            break;
        case "mission":
            stateMachine.clear();
            stateMachine.transition(states.Mission, response.parameters);
            break;
        case "goto":
            stateMachine.clear();
            stateMachine.transition(states.Goto, response.parameters);
            break;
        case "take":
            stateMachine.transition(states.Take);
            break;
        case "deposit":
            stateMachine.transition(states.Dump);
            break;
        case "save_waypoint":
            try {
                const waypoint = {
                    x: response.parameters.coordinates.x,
                    y: response.parameters.coordinates.y,
                    z: response.parameters.coordinates.z,
                    dimension: response.parameters.dimension,
                    description: response.parameters.description ?? ""
                }
                updateMemory((memory) => {
                    memory.waypoints[response.parameters.name] = waypoint;
                    return memory
                })
            } catch (error) {
                console.log(error)
            }
            break;
        // For bypass commands
        case "up_2":
            bot.chat("My current task is to " + stateMachine.currentState().description())
            break;
        case "@":
            const p = bot.entity.position;
            bot.chat("I'm at " + Math.round(p.x) + " " + Math.round(p.y) + " " + Math.round(p.z) + " in the " + bot.game.dimension.replace("the_", ""));
            break;
        case "status":
            async function reportStatus() {
                const status = await getStatus(stateMachine, bot);
                bot.chat(status);
            }
            reportStatus();
            break;
    }
}

module.exports = { functions, processFunction };