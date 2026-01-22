const zod = require('zod');

// Schema for user registration validation with phone number having exactly 11 digits starting with 0.
// Password should be minimum 8 characters longs with at least one uppercase, one special character and one number.

const registerSchema = zod.object({
    firstname: zod.string().min(1, 'Firstname is required'),
    lastname: zod.string().min(1, 'lastname is required'),
    phone: zod.string()
        .regex(/^0\d{10}$/, 'Phone number must be exactly 11 digits and start with 0'),
    password: zod.string()
        .min(8, 'Password must be at least 8 characters long')
        .regex(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, 'Password must contain at least one letter and one number'),
    role: zod.enum(['passenger', 'rider', 'installment']),
    // Optional rider-specific fields
    vehicleType: zod.string().optional(),
    licensePlate: zod.string().optional(),
    location: zod.object({
        type: zod.string().optional(),
        coordinates: zod.array(zod.number()).length(2).optional()
    }).optional(),
    isAvailable: zod.boolean().optional(),
    verified: zod.boolean().optional(),
    profilePic: zod.string().optional(),
    // Optional installment-specific fields
    paymentMethod: zod.string().optional(),
    installmentPlan: zod.string().optional(),
});


const loginSchema = zod.object({
    phone: zod.string()
        .regex(/^0\d{10}$/, 'Phone number must be exactly 11 digits and start with 0'),
    password: zod.string()
        .min(8, 'Password must be at least 8 characters long')
}); 

const validateUserSchema = async (req, res, next) => {
    try{
        const validatedUserData = registerSchema.parse(req.body)
        req.validatedUserData = validatedUserData;
        next()
    }catch (error){
        if (error.errors) {
            return res.status(400).json({
                success: false,
                errors: error.errors.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        next(error);
    }
}

const validateLoginSchema = async (req, res, next) => {
    try{
        const validatedLoginData = loginSchema.parse(req.body)
        req.validatedLoginData = validatedLoginData;
        next()
    }catch (error){
        if (error.errors) {
            return res.status(400).json({
                success: false,
                errors: error.errors.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        next(error);
    }
}


module.exports = {
    validateUserSchema, validateLoginSchema
};