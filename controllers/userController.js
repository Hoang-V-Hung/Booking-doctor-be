import validator from 'validator'
import bcrypt from 'bcrypt'
import userModel from '../models/userModel.js'
import jwt from 'jsonwebtoken'
import { v2 as cloudinary } from 'cloudinary'
import doctorModel from '../models/doctorModel.js'
import appointmentModel from '../models/appointmentModel.js'
import axios from 'axios'
import crypto from 'crypto'

// api to register a new user
const registerUser = async (req, res) => {

    try {

        const { name, email, password } = req.body

        if (!name || !password || !email) {
            return res.json({ success: false, message: 'Vui lòng điền đầy đủ thông tin' })
        }

        // validating the email
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: 'Vui lòng điền đúng định dạng email' })
        }

        // validating the password
        if (password < 8) {
            return res.json({ success: false, message: 'Mật khẩu phải có độ dài hơn 8 kí tự' })
        }

        // hasing the password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const userData = {
            name,
            email,
            password: hashedPassword
        }

        const newUser = new userModel(userData)
        const user = await newUser.save()

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// api to login a user
const loginUser = async (req, res) => {

    try {

        const { email, password } = req.body
        const user = await userModel.findOne({ email })

        if (!user) {
            return res.json({ success: false, message: 'Người dùng không tồn tại' })
        }

        const isMatch = await bcrypt.compare(password, user.password)

        if (isMatch) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
            res.json({ success: true, token })
        } else {
            res.json({ success: false, message: 'Thông tin không hợp lệ' })
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// api to get user profile data
const getProfile = async (req, res) => {

    try {

        const userId = req.userId;
        const userData = await userModel.findById(userId).select('-password')

        res.json({ success: true, userData })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// api to update profile
const updateProfile = async (req, res) => {
    try {

        const userId = req.userId
        const { name, phone, address, dob, gender } = req.body
        const imageFile = req.file

        if (!name || !phone || !dob || !gender) {
            return res.json({ success: false, message: 'Vui lòng điền đầy đủ thông tin' })
        }

        await userModel.findByIdAndUpdate(userId, { name, phone, address: JSON.parse(address), dob, gender })

        if (imageFile) {

            // uploading the image to cloudinary
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: 'image' })
            const imageURL = imageUpload.secure_url

            await userModel.findByIdAndUpdate(userId, { image: imageURL })
        }

        res.json({ success: true, message: 'Cập nhật hồ sơ thành công' })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}
// api to book appointment
const bookAppointment = async (req, res) => {

    try {
        const userId = req.userId; // lấy từ middleware JWT
        const { docId, slotDate, slotTime } = req.body;

        const docData = await doctorModel.findById(docId).select('-password')

        if (!docData.available) {
            return res.json({ success: false, message: 'Bác sĩ hiện không hoạt động' })
        }

        let slots_booked = docData.slots_booked

        // checking for slot availability
        if (slots_booked[slotDate]) {
            if (slots_booked[slotDate].includes(slotTime)) {
                return res.json({ success: false, message: 'Hết chỗ' })
            } else {
                slots_booked[slotDate].push(slotTime)
            }
        } else {
            slots_booked[slotDate] = []
            slots_booked[slotDate].push(slotTime)
        }

        const userData = await userModel.findById(userId).select('-password')

        delete docData.slots_booked

        const appointmentData = {
            userId,
            docId,
            userData,
            docData,
            amount: docData.fees,
            slotTime,
            slotDate,
            date: Date.now()
        }

        const newAppointment = new appointmentModel(appointmentData)
        await newAppointment.save()

        // save new slot data in docData
        await doctorModel.findByIdAndUpdate(docId, { slots_booked })

        res.json({ success: true, message: 'Thêm lịch hẹn thành công' })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// api to get user appointments
const listAppointment = async (req, res) => {

    try {

        const userId = req.userId;
        const appointments = await appointmentModel.find({ userId })

        res.json({ success: true, appointments })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// api to cancel appointment
const cancelAppointment = async (req, res) => {

    try {
        const userId = req.userId
        const { appointmentId } = req.body

        const appointmentData = await appointmentModel.findById(appointmentId)

        // verify appointment user
        if (appointmentData.userId !== userId) {
            return res.json({ success: false, message: 'Bạn không được phép hủy cuộc hẹn này' })
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true })

        // release the slot

        const { docId, slotDate, slotTime } = appointmentData

        const doctorData = await doctorModel.findById(docId)

        let slots_booked = doctorData.slots_booked

        slots_booked[slotDate] = slots_booked[slotDate].filter(e => e !== slotTime)

        await doctorModel.findByIdAndUpdate(docId, { slots_booked })

        res.json({ success: true, message: 'Huỷ lịch hẹn thành công' })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// api to make payment
const createMomoPayment = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) return res.json({ success: false, message: 'Không tìm thấy lịch hẹn' });

        const partnerCode = process.env.MOMO_PARTNER_CODE;
        const accessKey = process.env.MOMO_ACCESS_KEY;
        const secretKey = process.env.MOMO_SECRET_KEY;
        const requestId = `${partnerCode}${Date.now()}`;
        const orderId = requestId;
        const orderInfo = `Thanh toán lịch hẹn ${appointment._id}`;
        const redirectUrl = process.env.MOMO_REDIRECT_URL;
        const ipnUrl = process.env.MOMO_IPN_URL;
        const amount = appointment.amount;
        const requestType = 'captureWallet';
        const extraData = Buffer.from(JSON.stringify({ appointmentId })).toString('base64');

        const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
        const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

        const requestBody = {
            partnerCode,
            accessKey,
            requestId,
            amount,
            orderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            extraData,
            requestType,
            signature,
            lang: 'vi'
        };

        const momoResponse = await axios.post('https://test-payment.momo.vn/v2/gateway/api/create', requestBody, {
            headers: { 'Content-Type': 'application/json' }
        });

        return res.json({ success: true, payUrl: momoResponse.data.payUrl });
    } catch (error) {
        console.error(error);
        return res.json({ success: false, message: 'Thanh toán thất bại', error: error.message });
    }
};

const updatePaymentStatus = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        if (!appointmentId) return res.status(400).json({ success: false, message: 'Thiếu appointmentId' });

        await appointmentModel.findByIdAndUpdate(appointmentId, { payment: true });
        res.json({ success: true, message: 'Thanh toán thành công' });
    } catch (error) {
        console.error('updatePaymentStatus error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};


export { registerUser, loginUser, getProfile, updateProfile, bookAppointment, listAppointment, cancelAppointment, createMomoPayment, updatePaymentStatus }
