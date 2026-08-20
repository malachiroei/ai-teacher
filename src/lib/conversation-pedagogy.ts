export interface ConversationPedagogyTurn {
  userInput: string;
  tutorResponse: string;
  hebrewSubtitle: string;
}

function inferConversationGoal(userInput: string, tutorResponse: string) {
  const blob = `${userInput} ${tutorResponse}`.toLowerCase();
  if (/\b(hi|hello|hey|שלום|היי)\b/.test(userInput.toLowerCase()) || /nice to (see|meet)|great to hear/.test(blob)) {
    return "Greeting / rapport — warm open + invite to practice";
  }
  if (/\b(name|age|grade|how old)\b/.test(blob)) {
    return "Placement / identity — gather learner profile";
  }
  if (/\b(tennis|soccer|football|game|roblox|minecraft|pet|school|friend)\b/.test(blob)) {
    return "Topic interest — deepen a kid passion with follow-up";
  }
  if (/\?/.test(tutorResponse)) {
    return "English Next — keep conversation moving with a clear question";
  }
  return "Topic / English Next — explore intent with a level-appropriate question";
}

function inferTurnQuality(userInput: string, tutorResponse: string) {
  const reply = tutorResponse.trim();
  const hasQuestion = /\?/.test(reply);
  const wordCount = reply.split(/\s+/).filter(Boolean).length;
  const referencesUser =
    userInput.trim().length > 0 &&
    (reply.toLowerCase().includes(userInput.trim().toLowerCase().slice(0, 12)) ||
      /\byou\b|\byour\b/i.test(reply));

  if (hasQuestion && wordCount <= 24 && referencesUser) return "Engaging";
  if (hasQuestion && wordCount <= 28) return "Follow-up";
  if (hasQuestion) return "Natural flow";
  return "Natural flow";
}

export function formatConversationPedagogyReport(turn: ConversationPedagogyTurn) {
  const user = turn.userInput.trim() || "(empty)";
  const tutor = turn.tutorResponse.trim() || "(empty)";
  const hebrew = turn.hebrewSubtitle.trim() || "(pending)";
  return [
    "============== CONVERSATION FLOW REPORT ==============",
    `User Input:        "${user.slice(0, 140)}${user.length > 140 ? "…" : ""}"`,
    `Tutor Response:    "${tutor.slice(0, 160)}${tutor.length > 160 ? "…" : ""}"`,
    `Hebrew Subtitle:   "${hebrew.slice(0, 140)}${hebrew.length > 140 ? "…" : ""}"`,
    `Conversation Goal: ${inferConversationGoal(user, tutor)}`,
    `Turn Quality:      ${inferTurnQuality(user, tutor)}`,
    "======================================================",
  ].join("\n");
}

export function logConversationPedagogyReport(turn: ConversationPedagogyTurn) {
  console.log(`\n${formatConversationPedagogyReport(turn)}\n`);
}
