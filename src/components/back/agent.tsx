'use server'
    
import { StateGraph, START, END, Annotation } from "@langchain/langgraph"
import { callOpenRouter } from "./openRouter"
import { BaseMessage } from "@langchain/core/messages"

// -------- STATE TYPE --------

// -------- ANNOTATION --------

interface parsedObjectType {
  intent: "toolcall" | "final_answer" | "add_event";
  eventName: string;
  start: string;
  end: string;
  toolName: string;
  result: string;
  recurrence?: string;
}

interface EventMomory {
  eventName: string;
  start: string;
  end: string;
  date: string;
}

interface MyObjectType {
  type: string;
  value: string;
}

const myAnnotation = Annotation<MyObjectType>;
const parseAnnotation = Annotation<parsedObjectType>;

// -------- GRAPH STATE --------

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (currentState, updateValue) => {
      if (Array.isArray(updateValue)) {
        return currentState.concat(updateValue);
      }
      return currentState.concat([updateValue]);
    },
    default: () => [],
  }),
  input: Annotation<string>(),
  accessToken: Annotation<any>(),
  parsed: parseAnnotation,
  externalData: myAnnotation,
  answer: myAnnotation,
  calendarResult: myAnnotation,
  error: myAnnotation,
  eventsMemory: Annotation<EventMomory[]>(),
});

// -------- TOOLS --------

const tools: {
  readonly currentDate: () => Promise<{ type: string; value: string }>;
  // readonly calendar_create_event: (state: typeof GraphState.State) => Promise<any>;
  readonly weather: () => Promise<any>;
  [key: string]: (...args: any[]) => Promise<any>; // Add this index signature
} = {
  currentDate: async () => ({
    type: "currentDate",
    value: new Date().toISOString().split("T")[0],
  }),

  // calendar_create_event: async (state: typeof GraphState.State) => {
  //   const { eventName, start, end, recurrence } = state.parsed || {};
  
  //   console.log("addEvent: ", state);
  //   try {
  //     const abbreviation = new Date()
  // .toLocaleTimeString("en-us", { timeZoneName: "short" })
  // .split(" ")
  // .pop();
  // console.log("abbreviation: ",abbreviation);
  //     const eventData: any = {
  //       summary: eventName,
  //       start: { dateTime: start, timeZone: abbreviation },
  //       end: { dateTime: end, timeZone: abbreviation },
  //     };
  //     if (recurrence) {
  //       eventData.recurrence = [recurrence];
  //     }
  //     const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
  //       method: "POST",
  //       headers: {
  //         Authorization: `Bearer ${state.accessToken}`,
  //         "Content-Type": "application/json",
  //       },
  //       body: JSON.stringify(eventData),
  //     });
  //     console.log("res: ",res);
  
  //     const data = await res.json();
  
  //     if (!res.ok) throw new Error(data.error?.message);
  
  //     return {
  //       ...state,
  //       calendarResult: data,
  //       answer: `✅ Event "${eventName}" added from ${start} to ${end}`,
  //     };
  //   } catch (err: any) {
  //     return { ...state, error: err.message, answer: "❌ Failed to add event." };
  //   }
  // },

  weather: async () => {
    const res = await fetch("https://wttr.in/?format=%t");
    const text = await res.text();
    return {
      type: "weather",
      value: text,
    };
  },
};

const callTool = async (state: typeof GraphState.State) => {
  const toolName = state.parsed?.toolName;

  if (!toolName || !(toolName in tools)) {
    return {
      ...state,
      answer: "❌ Unknown tool",
    };
  }

  try {
    const result = await tools[toolName](state);
    if (toolName === "currentDate" || toolName === "weather") {
      return {
        ...state,
        externalData: result,
      };
    }
    return result;
  } catch (err: any) {
    return {
      ...state,
      error: err.message,
      answer: "❌ Tool execution failed",
    };
  }
};

const getexternalData = async (state: typeof GraphState.State) => {
  return {
    ...state,
    externalData: `Today is ${new Date().toISOString()}`,
  };
};

// -------- INTENT PARSING --------

const parseIntent = async (state: typeof GraphState.State) => {
  const prompt = `
  Today is "${new Date().toISOString()}"
  User asked: "${state.input}"
  ${state.externalData?.type ? `${state.externalData.type} is ${state.externalData.value}`  : "And if user asked about tomorrow, next week and so on - dynamic data not 2025.1.3, you have to ask currentDate.\nIf it's a calendar event, please provide the event details.\nIf it's a weather request, return the 'toolcall' on 'intent' and 'weather' on 'toolName'.\nIf it's a chat request, respond appropriately."}
  Is this a request to add a calendar event, get the weather, or chat?
  and if it is final answer, please input answer of question on 'eventName'.
  and if it is about add event, and it is result, please input 'add_event' on 'intent'.

  
  Respond in JSON format:
  {
    "intent": "toolcall" | "final_answer" | "add_event",
    "eventName": "string",
    "start": "ISO 8601 datetime",
    "end": "ISO 8601 datetime",
    "toolName": "weather" | "currentDate",
    "result": " answer about user's quetion."
    "recurrence": "string (optional, e.g., 'RRULE:FREQ=DAILY')"
  }
  `.trim();
 
  // Call your LLM service to get the response
  const res = await callOpenRouter(prompt);
  const raw = res.choices?.[0]?.message?.content || "{}";

  // Parse and handle the response
  try {
    const parsed = JSON.parse(raw);
    // if(parsed.intent == 'final_answer')
    //   return { ...state, parsed, answer: parsed.result};
    // console.log("parsed: ", parsed)
    return { ...state, parsed, answer: parsed.result };
  } catch (e) {
    return { ...state, error: "❌ Failed to parse LLM", answer: "Internal parsing error." };
  }
  
};
const timeOnly = (iso: any) => {
  const date = new Date(iso);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
};

// -------- EVENT HANDLING --------
const addEvent = async (state: typeof GraphState.State) => {
  const { eventName, start, end, recurrence } = state.parsed || {};
  const eventsMemory = state.eventsMemory;

  console.log("isOverlapping(in front): ",eventsMemory);
  const isOverlapping = eventsMemory.some((event: EventMomory) => {
    const isDateMatch = event.date === "everyday" || event.date === start.split("T")[0] || recurrence?.includes("DAILY"); // compare date only
  
    if (!isDateMatch) return false;
  
    const eventStart = timeOnly(event.start);
    const eventEnd = timeOnly(event.end);
    const newStart = timeOnly(start);
    const newEnd = timeOnly(end);
    console.log(newStart, newEnd, eventStart, eventEnd)
  
    return ((newStart < eventEnd && newEnd > eventStart) || newStart == eventStart || newEnd == eventEnd);
  });
  

  if (isOverlapping) {
    return {
      ...state,
      error: "❌ Event is overlapping with an existing one.",
      answer: "Your event is multiple.",
    };
  }

  try {
    // Get the time zone from the browser's settings
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Convert the start and end dates to ISO strings (ensure they include the time zone)
    const eventData: any = {
      summary: eventName,
      start: { dateTime: start.slice(0,-5), timeZone: timeZone },
      end: { dateTime: end.slice(0,-5), timeZone: timeZone },
    };

    // Handle recurrence if provided
    if (recurrence) {
      eventData.recurrence = [recurrence];
    }

    // Make the request to the Google Calendar API
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    });

    // Handle the response
    const data = await res.json();

    if (!res.ok) throw new Error(data.error?.message);

    const eventDate = recurrence?.includes("DAILY") ? "everyday" : start.split("T")[0];



    const updatedEventMemory = [
      ...eventsMemory,
      { eventName, start, end, date: eventDate }
    ];
    
    // storeEvents(updatedEventMemory);
    return {
      ...state,
      eventsMemory: updatedEventMemory,
      calendarResult: data,
      answer: `✅ Event "${eventName}" added from ${start} to ${end}`,
    };
  } catch (err: any) {
    return { ...state, error: err.message, answer: "❌ Failed to add event." };
  }
};


const fallbackAnswer = async (state: typeof GraphState.State) => {
  return {
    ...state,
    answer: state.answer || "✅ Message understood. No tools needed.",
  };
};

// -------- GRAPH BUILD --------

const buildAgentGraph = () => {
  const builder = new StateGraph(GraphState);

  builder.addNode("getDate", getexternalData);
  builder.addNode("parse", parseIntent);
  builder.addNode("final", fallbackAnswer);
  builder.addNode("callTool", callTool);
  builder.addNode("addevent", addEvent)

  builder.addEdge(START, "parse" as any);

  builder.addConditionalEdges("parse" as any, (state) => {
    if (state.parsed?.intent === "toolcall")  return "callTool";
    if (state.parsed?.intent === "add_event") return "addevent";
    return "final";
  });
  builder.addEdge("callTool" as any, "parse" as any);
  builder.addEdge("addevent" as any, END)
  builder.addEdge("final" as any, END);

  return builder.compile();
};

const graph = buildAgentGraph();

// -------- EXPORTED RUNNER --------

export async function agentHandler(input: string, accessToken: any, eventsMemory: any) {
  console.log("input: ", input);
  const finalState = await graph.invoke({ input, accessToken, eventsMemory });
  return finalState;
}
