module.exports = {
    replaySafe: true,
    match({ parsed }) {
        return false; // não é trigger de mensagem
    },
    async handle() {
        return null;
    }
};
