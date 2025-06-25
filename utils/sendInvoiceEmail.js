const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const { Readable } = require("stream");

function generatePDFBuffer({ customerName, programName, amount, currency, date }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });

        // Header with logo
        doc.image('assets/logo.png', {
            fit: [120, 60],
            align: 'center',
        });


        doc.moveDown(1.5);

        // Title
        doc
            .fontSize(20)
            .fillColor('#1B4332')
            .text('Payment Receipt', { align: 'center' })
            .moveDown(2);

        // Invoice details
        doc.fontSize(14).fillColor('black')
            .text(`Name: ${customerName}`)
            .moveDown(0.5)
            .text(`Program: ${programName}`)
            .moveDown(0.5)
            .text(`Amount Paid: ${amount} ${currency}`)
            .moveDown(0.5)
            .text(`Date: ${date}`)
            .moveDown(1.5);


        // Thank you note
        doc
            .fontSize(12)
            .fillColor('#444')
            .text('Thank you for your enrollment and trust in Coach Asmaa.', {
                align: 'left',
            });

        // Footer
        doc
            .moveDown(4)
            .fontSize(10)
            .fillColor('#888')
            .text(
                'Coach Asmaa • www.asmaagad.com • asmaa.amr.gadelrab@gmail.com',
                { align: 'center' }
            );

        doc.end();
    });
}


async function sendInvoiceEmail({ email, amount, currency, programName, date, customerName }) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const pdfBuffer = await generatePDFBuffer({ customerName, programName, amount, currency, date });

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: auto; border: 1px solid #ddd; border-radius: 8px;">
            <!-- Header -->
            <div style="background-color: #1B4332; padding: 20px; text-align: center;">
                <img src="https://firebasestorage.googleapis.com/v0/b/coachasmaa-17191.firebasestorage.app/o/logo3.png?alt=media&token=8234bedc-1a3c-4a0e-a04e-cbd38908b661" style="max-height: 60px;" />
            </div>

            <!-- Body -->
            <div style="padding: 30px 20px; background-color: #ffffff;">
                <h2 style="color: #1B4332;">Hello ${customerName},</h2>
                <p>Thank you for enrolling in the <strong>${programName}</strong>.</p>

                <h3 style="margin-top: 30px;">📄 Payment Summary</h3>
                <table style="width: 100%; margin-top: 15px; font-size: 16px;">
                    <tr><td><strong>💰 Amount Paid:</strong></td><td>${amount} ${currency}</td></tr>
                    <tr><td><strong>📅 Date:</strong></td><td>${date}</td></tr>
                    <tr><td><strong>🧾 Program:</strong></td><td>${programName}</td></tr>
                </table>

                <p style="margin-top: 30px;">A PDF copy of your invoice is attached to this email.</p>

                <p>Warm regards,<br/><strong>Coach Asmaa Team</strong></p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8f8f8; text-align: center; font-size: 13px; color: #777; padding: 15px;">
                © 2025 Coach Asmaa |
                <a href="https://asmaagad.com" style="color: #1B4332;">www.asmaagad.com</a> |
                <a href="https://www.instagram.com/coachasmaa/" style="margin: 0 8px;">
                    <img src="https://img.icons8.com/ios-filled/24/1B4332/instagram-new.png" alt="Instagram" />
                </a>
                <a href="https://wa.me/201234567890" style="margin: 0 8px;">
                    <img src="https://img.icons8.com/ios-filled/24/1B4332/whatsapp--v1.png" alt="WhatsApp" />
                </a>
            </div>
        </div>
    `;

    await transporter.sendMail({
        from: `"Coach Asmaa" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Your Program Enrollment: ${programName}`,
        html: htmlContent,
        attachments: [
            {
                filename: "invoice.pdf",
                content: pdfBuffer,
                contentType: "application/pdf",
            },
        ],
    });

    console.log("✅ Invoice email with PDF sent to:", email);
}

module.exports = sendInvoiceEmail;
