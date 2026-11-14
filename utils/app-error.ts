// An error that knows which HTTP status to send and, optionally, which
// request field caused it. The controller sends AppErrors to the client as-is.
// Anything that is NOT an AppError is treated as an unexpected failure (500).
class AppError extends Error {
    status: number;
    field?: string;

    constructor(message: string, status: number = 400, field?: string) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        if (field) this.field = field;
    }
}

module.exports = AppError;