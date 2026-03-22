function parseDurationToISO(text) {
    // Padrões:
    // 2h, 2,5h, 2 horas, 2 hrs
    // 40m, 40 min, 40 minutos
    // 2h 40m

    // Normaliza
    const clean = text.toLowerCase().replace(/,/g, ".");

    let totalMinutes = 0;

    // Captura horas
    const matchHours = clean.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|horas?)/);
    if (matchHours) {
        totalMinutes += parseFloat(matchHours[1]) * 60;
    }

    // Captura minutos (isolados ou após horas)
    const matchMinutes = clean.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minutos?)/);
    if (matchMinutes) {
        totalMinutes += parseFloat(matchMinutes[1]);
    }

    // Fallback: se for só número, assume minutos? 
    // Melhor não assumir para evitar erro, mas o usuário disse "40 minutos".
    // Se o usuário digitar só "40", ignoramos ou assumimos min?
    // Vamos assumir minutos se não tiver unidade e não tiver horas identificadas?
    // Por segurança, exigimos unidade ou assumimos string bruta se falhar.

    if (totalMinutes === 0) {
        // Tentativa de pegar números soltos se nada foi capturado
        const onlyNumbers = clean.match(/^(\d+(?:\.\d+)?)\s*$/);
        if (onlyNumbers) {
            // Default para minutos?
            // totalMinutes = parseFloat(onlyNumbers[1]);
            return null; // Força explícito
        }
    }

    if (totalMinutes === 0) return null;

    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);

    let s = "PT";
    if (h > 0) s += `${h}H`;
    if (m > 0) s += `${m}M`;
    if (h === 0 && m === 0) s += "0M"; // 0 minutos

    return s;
}

module.exports = { parseDurationToISO };
