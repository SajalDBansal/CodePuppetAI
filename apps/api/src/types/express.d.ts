declare global {
    namespace Express {
        interface Request {
            authSession?: {
                id: string
                token: string
                expiresAt: Date
            }

            authUser?: {
                id: string;
                name: string;
                email: string;
                role: string
            };
        }
    }
}

export { };
