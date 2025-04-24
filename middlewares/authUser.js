import jwt from 'jsonwebtoken'

// user auth middleware
const authUser = async (req, res, next) => {
    try {

        const { token } = req.headers
        if (!token) {
            return res.json({ success: false, message: "Không được phép đăng nhập lại" })
        }
        const token_decode = jwt.verify(token, process.env.JWT_SECRET)
        req.userId = token_decode.id;
        next()

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

export default authUser