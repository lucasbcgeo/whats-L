const { appendTaskToSection } = require("../lib/obsidianClient");
const { getLogicalDate } = require("../lib/obsidianClient").time;
const { getHandlerForTrigger, getSection } = require("../config/commands");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "task";
    },
    async handle({ msg, parsed }) {
        const taskText = parsed.args.join(" ").trim();
        if (!taskText) {
            console.log("[TASK] Texto vazio, ignorando.");
            return;
        }

        const dateStr = getLogicalDate(msg.timestamp);
        const section = getSection("task");
        const result = await appendTaskToSection({ dateStr, taskText, section });

        console.log("[TASK] Adicionada:", taskText);

        return {
            metric: "task",
            key: "__task__",
            value: taskText
        };
    },
};
