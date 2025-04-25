import jwt from 'jsonwebtoken'

// doctor auth middleware
const authDoctor = async (req, res, next) => {
    try {

        const { dtoken } = req.headers
        if (!dtoken) {
            return res.json({ success: false, message: "Không được phép đăng nhập lại" })
        }
        const token_decode = jwt.verify(dtoken, process.env.JWT_SECRET)
        req.docId = token_decode.id;
        next()

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

export default authDoctor