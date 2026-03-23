function parseDurationToISO(text) {
    const clean = text.toLowerCase().replace(/,/g, ".");

    let totalMinutes = 0;

    const matchHours = clean.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|horas?)/);
    if (matchHours) {
        totalMinutes += parseFloat(matchHours[1]) * 60;
    }

    const matchMinutes = clean.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minutos?)/);
    if (matchMinutes) {
        totalMinutes += parseFloat(matchMinutes[1]);
    }

    if (totalMinutes === 0) {
        const onlyNumbers = clean.match(/^(\d+(?:\.\d+)?)\s*$/);
        if (onlyNumbers) {
            return null;
        }
    }

    if (totalMinutes === 0) return null;

    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);

    let s = "PT";
    if (h > 0) s += `${h}H`;
    if (m > 0) s += `${m}M`;
    if (h === 0 && m === 0) s += "0M";

    return s;
}

module.exports = { parseDurationToISO };
