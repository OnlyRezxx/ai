import { GoogleGenAI, Content, Part } from "@google/genai";
import { Attachment, Message } from "../types";

// Helper to determine model based on config
export const getModelName = (deepThink: boolean) => {
  // Use Gemini 2.5 Flash for Deep Think capability
  if (deepThink) return "gemini-2.5-flash";
  // Use Gemini 3 Pro Preview for high-quality standard coding tasks
  return "gemini-3-pro-preview";
};

const BASE_INSTRUCTION = `
You are 'Roblox Architect', a world-class Roblox Studio expert AI. 
Your goal is to assist developers in creating high-quality games on the Roblox platform.

Attributes:
1.  **Professional & Modern:** You write clean, optimized, and strictly typed Luau code. Use 'task.wait', 'OverlapParams', 'TweenService', etc.
2.  **UI/UX Expert:** Suggest UDim2, AnchorPoints, and clean hierarchy. **Always include specific UDim2 values (e.g., \`UDim2.new(0.5, 0, 0.5, 0)\`) and AnchorPoint examples (e.g., \`Vector2.new(0.5, 0.5)\`) when suggesting UI layouts.**
3.  **Secure:** Prioritize filtering text and securing RemoteEvents.
4.  **Formatting:** Always wrap code in \`\`\`lua blocks.
`;

const ANALYZE_INSTRUCTION = `
[ACTIVE MODE: CODE ANALYSIS]
The user wants a strict review.
- **Identify Missing Types:** Point out variables/functions lacking types.
- **Modularity:** Suggest splitting monoliths into ModuleScripts.
- **Safety:** Flag insecure RemoteEvent usage.
- **Style:** Enforce Roblox Lua Style Guide.
`;

const OPTIMIZE_INSTRUCTION = `
[ACTIVE MODE: OPTIMIZATION]
The user requires HIGH PERFORMANCE code.
- **Critical:** Avoid O(n^2) loops. Use dictionary lookups.
- **Memory:** properly disconnect RBXScriptConnections (Janitor/Maid).
- **Network:** Minimize RemoteEvent payloads.
- **Threading:** Use Parallel Luau (Actors) for heavy tasks.
- **Explanation:** You MUST explain specific optimization choices made.
`;

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: string,
  attachments: Attachment[],
  deepThink: boolean,
  analyzeMode: boolean,
  optimizeMode: boolean
): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY not found in environment variables");

    const ai = new GoogleGenAI({ apiKey });
    const modelName = getModelName(deepThink);

    // Prepare configuration dynamically based on ALL active modes
    let systemInstruction = BASE_INSTRUCTION;
    
    // Append instructions if modes are active (they stack now)
    const activeModes = [];
    if (analyzeMode) {
      systemInstruction += "\n\n" + ANALYZE_INSTRUCTION;
      activeModes.push("Analysis");
    }
    if (optimizeMode) {
      systemInstruction += "\n\n" + OPTIMIZE_INSTRUCTION;
      activeModes.push("Optimization");
    }
    
    if (activeModes.length > 0) {
      systemInstruction += `\n\nUser has enabled the following modes: ${activeModes.join(', ')}. Please adhere to ALL instructions above.`;
    }

    const config: any = {
      systemInstruction: systemInstruction,
    };

    // Configure Deep Think if enabled
    if (deepThink) {
      config.thinkingConfig = { thinkingBudget: 8192 }; 
    }

    // Convert history to API format
    const validHistory = history.map(msg => ({
      role: msg.role,
      parts: [
        { text: msg.content },
        ...(msg.attachments || []).map(att => ({
          inlineData: { mimeType: att.mimeType, data: att.data }
        }))
      ]
    }));

    // Current message parts
    const currentParts: Part[] = [{ text: newMessage }];
    
    // Add new attachments
    attachments.forEach(att => {
      currentParts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.data
        }
      });
    });

    const contents: Content[] = [
      ...validHistory,
      { role: 'user', parts: currentParts }
    ];

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: config
    });

    return response.text || "No response generated.";

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};