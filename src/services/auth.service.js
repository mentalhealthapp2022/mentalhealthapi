const httpStatus = require('http-status');
const tokenService = require('./token.service');
const userService = require('./user.service');
const Token = require('../models/token.model');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const scheduleService = require('./user.service');
const { Schedule, User } = require('../models');

const FCM = require('fcm-node');
let serverKey = "BGnfhZZESjMVNTApgZPsuwQQQZKr1Hh7YXWKpybUwMokGyevYMn8CX7vbj95DgD5COB7_m1I5bMckafelGDsDjg";
let fcm = new FCM(serverKey);

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  return user;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({ token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(resetPasswordToken, tokenTypes.RESET_PASSWORD);
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await userService.updateUserById(user.id, { password: newPassword });
    await Token.deleteMany({ user: user.id, type: tokenTypes.RESET_PASSWORD });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(verifyEmailToken, tokenTypes.VERIFY_EMAIL);
    const user = await userService.getUserById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user.id, type: tokenTypes.VERIFY_EMAIL });
    await userService.updateUserById(user.id, { isEmailVerified: true });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email verification failed');
  }
};

const addSchedule = async (body) => {
  let userData, schedule;
  try {
    userData = await User.findById(body.added_for);
  } catch(error) {
    console.log("Query Error: ",error);
  }
  
  try {
    schedule = await Schedule.create(body);
  } catch (error) {
    console.log("Query Error: ",error);
  }


  if(userData && userData.device_token && userData.device_token !="") {
    let message = {
      to: userData.device_token,
      data: {
        title: "Schedule Updated",
        body: body
      }
    };
  
    await fcm.send(message, async function(err, response) {
        if (err) {
            console.log("FCM Notification: Something has gone wrong!"+err);
            console.log("Response:! "+response);
        } else {
            // showToast("Successfully sent with response");
            console.log("FCM Notification successfully!");
        }

    });

    return schedule;
  }
};

const getSchedule = async (userId) => {
  let scheduleData;

  try {
    scheduleData = await Schedule.find({ added_for: userId }).lean();
  } catch (error) {
    console.log("Query Error: ",error);
  }

  return scheduleData;
};

const addUpdateDeviceToken = async (body) => {
  let userData;
  try {
    userData = await User.findOneAndUpdate({_id: body.user_id}, { device_token: body.device_token }, { new: true}).lean();
  } catch (error) {
    console.log("Query Error: ",error);
  }
  return userData;
};

module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
  addSchedule,
  getSchedule,
  addUpdateDeviceToken
};
