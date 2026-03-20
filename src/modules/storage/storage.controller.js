const {
  removeFileFromStorage,
  removeFilesFromStorage,
  uploadMultipleFiles: uploadManyFilesToStorage,
  uploadSingleFile,
} = require('./storage.service');

const normalizeFolder = (value) => {
  if (!value || typeof value !== "string") {
    return "uploads";
  }

  return value.trim() || "uploads";
};

const normalizeKey = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  return decodeURIComponent(value).trim();
};

exports.uploadFile = async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = await uploadSingleFile(req.file, normalizeFolder(req.body.folder));

    return res.status(201).json({
      message: 'File uploaded successfully',
      file: uploadedFile,
    });
};

exports.deleteFile = async (req, res, next) => {
    const key = normalizeKey(req.params.key || req.query.key);

    if (!key) {
      return res.status(400).json({ error: 'File key is required' });
    }

    await removeFileFromStorage(key);

    return res.status(200).json({
      message: 'File deleted successfully',
      key,
    });
};

exports.uploadMultipleFiles = async (req, res, next) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = await uploadManyFilesToStorage(req.files, normalizeFolder(req.body.folder));

    return res.status(201).json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
    });
};

exports.deleteMultipleFiles = async (req, res, next) => {
    const keys = Array.isArray(req.body.keys)
      ? req.body.keys.map(normalizeKey).filter(Boolean)
      : [];

    if (keys.length === 0) {
      return res.status(400).json({ error: 'File keys are required' });
    }

    await removeFilesFromStorage(keys);

    return res.status(200).json({
      message: 'Files deleted successfully',
      keys,
    });
};
