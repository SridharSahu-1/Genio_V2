import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  originalKey: { type: String, required: true },
  videoUrl: { type: String }, // Public S3 URL for direct access
  subtitleKey: { type: String },
  docId: { type: String, unique: true, sparse: true }, // Unique identifier for linking video and subtitle
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  progress: { type: Number, default: 0 },
}, { timestamps: true });

// Generate docId before saving if not present
videoSchema.pre('save', async function() {
  const doc = this as any;
  if (!doc.docId && doc._id) {
    doc.docId = doc._id.toString();
  }
});

export default mongoose.model('Video', videoSchema);



