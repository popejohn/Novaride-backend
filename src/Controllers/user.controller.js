const userModel = require('../Schemas/user.schema.js');
const transactionModel = require('../Schemas/transaction.mongoose.schema');
const installmentModel = require('../Schemas/installment.mongoose.schema');
const { errorResponse, successResponse } = require('../Utils/responseHelper');
const INSTALLMENT_CONSTANTS = require('../Configs/installment.constants');
const { formatInstallmentDashboardData, getNextBusinessDay } = require('../Services/installment.service');
const { notifyAdmin } = require('../Services/installmentNotification.service');

const getWalletData = async (req, res) => {
  try {
    const decodedToken = req.user;

    // Set no-cache headers to prevent 304 responses
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const user = await userModel.findById(decodedToken.id).select('wallet');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const transactions = await transactionModel.find({ user: decodedToken.id })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.status(200).json({
      message: 'Wallet data fetched successfully',
      walletBalance: user.wallet,
      transactions: transactions
    });
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getInstallmentData = async (req, res) => {
  try {
    const decodedToken = req.user;
    
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const user = await userModel.findById(decodedToken.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const installment = await installmentModel.findOne({ user: decodedToken.id });

    if (!installment) {
      return res.status(200).json({
        message: 'No active installment plan found',
        installment: null
      });
    }

    const formattedData = formatInstallmentDashboardData(installment, user);

    return res.status(200).json({
      message: 'Installment data fetched successfully',
      installment: formattedData
    });
  } catch (error) {
    console.error('Error fetching installment data:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const saveInstallmentProfile = async (req, res) => {
  try {
    const decodedToken = req.user;
    const {
      personal = {},
      nextOfKin = {},
      vehicle = {},
      guarantors = [],
      documents = {},
      terms = {},
      paymentDetails = {}
    } = req.body;

    // 1. Strict Terms and Conditions Validation
    if (!terms || terms.accepted !== true) {
      return errorResponse(res, 400, 'You must review and agree to the Terms and Conditions to submit this application.');
    }

    // 2. Personal Information Validation (Section A & B)
    if (!personal.firstname || !personal.lastname || !personal.phone || !personal.email) {
      return errorResponse(res, 400, 'Full name, phone, and email are required in personal information.');
    }

    if (!personal.dateOfBirth || !personal.gender || !personal.maritalStatus || !personal.address) {
      return errorResponse(res, 400, 'Date of birth, gender, marital status, and home address are required.');
    }

    // 3. Identification Details Validation (Section B & Documents)
    if (!documents.idType || !documents.idNumber) {
      return errorResponse(res, 400, 'Valid identification means and ID number are required.');
    }

    if (!documents.idDocumentUrl) {
      return errorResponse(res, 400, 'Valid government ID document upload is required.');
    }

    if (!documents.applicantPhotoUrl) {
      return errorResponse(res, 400, 'Applicant passport photograph upload is required.');
    }

    // Driver's license document check if driver's license was chosen
    if (documents.idType === 'drivers-license' && !documents.driverLicenseUrl && !documents.idDocumentUrl) {
      return errorResponse(res, 400, "Driver's license document upload is required.");
    }

    // 4. Next of Kin Validation (Section C)
    if (!nextOfKin.name || !nextOfKin.relationship || !nextOfKin.phone || !nextOfKin.address) {
      return errorResponse(res, 400, 'All Next of Kin details (Name, relationship, phone, address) are required.');
    }

    // 5. Guarantor 1 and Guarantor 2 Validation (Sections G & H)
    if (!Array.isArray(guarantors) || guarantors.length < 2) {
      return errorResponse(res, 400, 'Two valid guarantors with photographs and contact details are required.');
    }

    for (let i = 0; i < 2; i++) {
      const g = guarantors[i];
      if (!g || !g.name || !g.phone || !g.relationship || !g.homeAddress || !g.occupation || !g.officeAddress) {
        return errorResponse(res, 400, `Guarantor ${i + 1} information is incomplete. Name, phone, relationship, home address, occupation, and office address are required.`);
      }
      if (!g.photoUrl) {
        return errorResponse(res, 400, `Guarantor ${i + 1} passport photograph upload is required.`);
      }
    }

    const termsPayload = {
      accepted: true,
      acceptedAt: new Date(),
      termsVersion: terms.termsVersion || INSTALLMENT_CONSTANTS.CURRENT_TERMS_VERSION
    };

    const completeProfileData = {
      personal,
      nextOfKin,
      vehicle: {
        vehicleType: vehicle.vehicleType || 'Tricycle',
        plateNumber: vehicle.plateNumber || 'PENDING_ASSIGNMENT',
        modelMake: vehicle.modelMake || 'TVS King 200cc',
        color: vehicle.color || 'Yellow',
        ownership: vehicle.ownership || 'Company'
      },
      guarantors,
      documents,
      terms: termsPayload,
      paymentDetails
    };

    // Update User Document
    const updatedUser = await userModel.findByIdAndUpdate(decodedToken.id, {
      $set: {
        firstname: personal.firstname,
        lastname: personal.lastname,
        address: personal.address,
        dateOfBirth: personal.dateOfBirth,
        profilePic: documents.applicantPhotoUrl || undefined,
        installmentProfile: completeProfileData,
        profileCompleted: true,
        installmentProfileCompleted: true
      },
      $addToSet: { role: 'installment' }
    }, { new: true }).select('-password');

    // Create or Update Installment Document
    let installment = await installmentModel.findOne({ user: decodedToken.id });

    if (!installment) {
      installment = new installmentModel({
        user: decodedToken.id,
        vehicleName: `${completeProfileData.vehicle.vehicleType} (${completeProfileData.vehicle.modelMake})`,
        vehiclePlate: 'PENDING_ASSIGNMENT',
        vehicleType: completeProfileData.vehicle.vehicleType,
        vehicleModel: completeProfileData.vehicle.modelMake,
        vehicleColor: completeProfileData.vehicle.color,
        vehicleOwnership: completeProfileData.vehicle.ownership,
        vehicleImage: documents.applicantPhotoUrl || '',
        totalAmount: INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT,
        depositAmount: INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT,
        paidAmount: 0,
        remainingBalance: INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT,
        dailyInstallment: INSTALLMENT_CONSTANTS.DAILY_INSTALLMENT_AMOUNT,
        totalScheduledDays: INSTALLMENT_CONSTANTS.TOTAL_SCHEDULED_DAYS,
        completedDays: 0,
        depositPaid: false,
        status: INSTALLMENT_CONSTANTS.STATUS.DEPOSIT_PENDING,
        installmentPlan: 'Maruwa Daily Ownership Plan (₦18,000 / day Mon-Fri)',
        terms: termsPayload,
        documents: {
          applicantPhoto: documents.applicantPhotoUrl,
          guarantor1Photo: guarantors[0]?.photoUrl,
          guarantor2Photo: guarantors[1]?.photoUrl,
          idDocument: documents.idDocumentUrl,
          idType: documents.idType,
          idNumber: documents.idNumber,
          driverLicense: documents.driverLicenseUrl || '',
          driverLicenseNumber: documents.driverLicenseNumber || ''
        }
      });
      await installment.save();
    } else {
      installment.terms = termsPayload;
      installment.documents = {
        applicantPhoto: documents.applicantPhotoUrl || installment.documents?.applicantPhoto,
        guarantor1Photo: guarantors[0]?.photoUrl || installment.documents?.guarantor1Photo,
        guarantor2Photo: guarantors[1]?.photoUrl || installment.documents?.guarantor2Photo,
        idDocument: documents.idDocumentUrl || installment.documents?.idDocument,
        idType: documents.idType || installment.documents?.idType,
        idNumber: documents.idNumber || installment.documents?.idNumber,
        driverLicense: documents.driverLicenseUrl || installment.documents?.driverLicense,
        driverLicenseNumber: documents.driverLicenseNumber || installment.documents?.driverLicenseNumber
      };
      await installment.save();
    }

    // Trigger Admin Notification
    notifyAdmin('new_application', {
      user: `${personal.firstname} ${personal.lastname}`,
      phone: personal.phone,
      termsVersion: termsPayload.termsVersion
    }).catch(console.error);

    return res.status(200).json({
      message: 'Installment profile and application saved successfully',
      user: updatedUser,
      installment: formatInstallmentDashboardData(installment, updatedUser)
    });

  } catch (error) {
    console.error('Error saving installment profile:', error);
    return res.status(500).json({ message: 'Server error saving profile', error: error.message });
  }
};

const saveInstallmentApplication = async (req, res) => {
  // Legacy / fallback endpoint redirecting to saveInstallmentProfile
  return saveInstallmentProfile(req, res);
};

module.exports = { getWalletData, getInstallmentData, saveInstallmentProfile, saveInstallmentApplication };
