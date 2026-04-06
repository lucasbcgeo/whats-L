const { appendTaskToSection } = require("../lib/obsidianClient");
const { getHandlerForTrigger, getSection } = require("../config");
const { parseFlags } = require("../utils/parse");
const { resolveDateFlag } = require("../utils/dateParser");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "task";
    },
    async handle({ msg, parsed }) {
        const { flags, remaining } = parseFlags(parsed.args);
        const taskText = remaining.join(" ").trim();
        if (!taskText) {
            console.log("[TASK] Texto vazio, ignorando.");
            return;
        }

        const dateOverride = flags.data ? resolveDateFlag(flags.data, msg.timestamp) : null;
        const dateRefColumn = flags.dataref === "sim";
        const dateStr = dateOverride || getLogicalDate(msg.timestamp);
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
