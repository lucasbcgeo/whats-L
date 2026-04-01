const { data } = require("../config");

function getForwarderTypeForDestination(destKey) {
    if (destKey === "self") return "WHATStoLOCAL";
    
    const destConfig = data.destinations?.[destKey];
    if (!destConfig) return null;
    
    if (destConfig.groupName) return "WHATStoWHATS";
    if (destConfig.localPath) return "WHATStoLOCAL";
    
    return null;
}

function getForwarderTypeForProfile(profileName) {
    const profile = data.profiles?.[profileName];
    if (!profile) return null;
    
    const allowedDests = profile.allowedDestinations || [];
    
    if (allowedDests.length === 0) return "ANY";
    
    const types = new Set();
    
    for (const destKey of allowedDests) {
        const type = getForwarderTypeForDestination(destKey);
        if (type) types.add(type);
    }
    
    if (types.size === 1) {
        return types.values().next().value;
    }
    
    if (types.size > 1) {
        return "BOTH";
    }
    
    return null;
}

module.exports = {
    getForwarderTypeForDestination,
    getForwarderTypeForProfile,
};
