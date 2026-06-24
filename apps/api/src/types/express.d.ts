declare global {
    namespace Express {
        interface Request {
            session?: {
                id: string
                accessToken: string
            };

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
