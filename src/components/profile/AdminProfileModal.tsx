import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  User,
  Phone,
  Mail,
  Shield,
  Save,
  Loader2,
  Crop,
  Sliders,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminGatewayClient } from '../../services/adminGatewayClient';

export interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'profile' | 'photo';
  onOpenSecurity?: () => void;
  onOpenChangePassword?: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'profile',
  onOpenSecurity,
  onOpenChangePassword,
}) => {
  const { currentAdmin, sessionAal, updateCurrentAdmin } = useAdminAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'photo'>(initialTab);
  const [fullName, setFullName] = useState(currentAdmin?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(currentAdmin?.phoneNumber || '');

  // Photo cropper states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Status & feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Sync state when currentAdmin changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setFullName(currentAdmin?.fullName || '');
      setPhoneNumber(currentAdmin?.phoneNumber || '');
      setActiveTab(initialTab);
      setFeedback(null);
      resetCropper();
    }
  }, [isOpen, currentAdmin, initialTab]);

  const resetCropper = () => {
    setSelectedFile(null);
    setImageSrc(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    imgRef.current = null;
  };

  // Handle image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5 MB limit)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setFeedback({
        type: 'error',
        message: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 5.00 MB.`,
      });
      return;
    }

    // Validate format
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setFeedback({
        type: 'error',
        message: 'Invalid file format. Only JPEG, PNG, and WebP images are permitted.',
      });
      return;
    }

    setSelectedFile(file);
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const src = loadEvent.target?.result as string;
      setImageSrc(src);
      setZoom(1);
      setPan({ x: 0, y: 0 });

      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        drawCropperPreview(img, 1, { x: 0, y: 0 });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // Render canvas with circular mask and current zoom/pan
  const drawCropperPreview = (
    img: HTMLImageElement,
    currentZoom: number,
    currentPan: { x: number; y: number }
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 512;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    // Save context for circular clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Fill background with subtle dark tone
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    // Calculate aspect-ratio scaling
    const scale = Math.max(size / img.width, size / img.height) * currentZoom;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;

    const dx = (size - scaledWidth) / 2 + currentPan.x;
    const dy = (size - scaledHeight) / 2 + currentPan.y;

    ctx.drawImage(img, dx, dy, scaledWidth, scaledHeight);
    ctx.restore();
  };

  // Re-draw whenever zoom or pan changes
  useEffect(() => {
    if (imgRef.current) {
      drawCropperPreview(imgRef.current, zoom, pan);
    }
  }, [zoom, pan]);

  // Drag handlers for repositioning the image in the cropper
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageSrc) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Save cropped photo
  const handleSavePhoto = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      // Export as high-quality WebP or PNG data URL
      const dataUrl = canvas.toDataURL('image/webp', 0.92);

      const res = await adminGatewayClient.uploadProfilePhoto(dataUrl);
      if (res.success && res.avatarUrl) {
        updateCurrentAdmin({ avatarUrl: res.avatarUrl });
        setFeedback({ type: 'success', message: 'Profile photo updated and saved successfully!' });
        resetCropper();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to upload profile photo' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove existing photo
  const handleRemovePhoto = async () => {
    if (!currentAdmin?.avatarUrl) return;

    if (!window.confirm('Are you sure you want to remove your profile photo? Your account will revert to displaying initials.')) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await adminGatewayClient.removeProfilePhoto();
      updateCurrentAdmin({ avatarUrl: null });
      setFeedback({ type: 'success', message: 'Profile photo removed successfully.' });
      resetCropper();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to remove profile photo' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save profile text fields (full name, phone)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 2) {
      setFeedback({ type: 'error', message: 'Full name must be at least 2 characters long.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await adminGatewayClient.updateProfile({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
      });
      if (res.success) {
        updateCurrentAdmin({
          fullName: res.data.fullName,
          phoneNumber: res.data.phoneNumber,
        });
        setFeedback({ type: 'success', message: 'Profile information updated successfully!' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update profile details' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'SA';
    return name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Administrator Profile"
      subtitle="Manage your personal administrator identity, contact details, and platform avatar."
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            onClick={() => {
              setActiveTab('profile');
              setFeedback(null);
            }}
            className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'profile'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            General Profile
          </button>
          <button
            onClick={() => {
              setActiveTab('photo');
              setFeedback(null);
            }}
            className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'photo'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Profile Photo & Studio
            {currentAdmin?.avatarUrl && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* TAB 1: General Profile */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Quick Photo Header */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-emerald-500/40 bg-slate-800 shrink-0 flex items-center justify-center text-lg font-bold text-emerald-400 shadow-md">
                {currentAdmin?.avatarUrl ? (
                  <img
                    src={currentAdmin.avatarUrl}
                    alt={currentAdmin.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getInitials(currentAdmin?.fullName)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {currentAdmin?.fullName || 'Super Administrator'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                  {currentAdmin?.email}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('photo')}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Camera className="w-3 h-3" />
                    Change Photo
                  </button>
                  {currentAdmin?.avatarUrl && (
                    <>
                      <span className="text-slate-400">·</span>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={isSubmitting}
                        className="text-[11px] font-semibold text-rose-500 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Display / Full Name
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Enter full administrator name"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Read-Only Identity Governance Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Administrator Email:
                </span>
                <span className="font-mono text-slate-900 dark:text-slate-100">
                  {currentAdmin?.email}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  Platform Role & Governance:
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase text-[10px]">
                  {currentAdmin?.role || 'super_admin'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  <Lock className="w-3.5 h-3.5 text-sky-400" />
                  Session Assurance Level:
                </span>
                <span className="font-mono text-sky-400 font-bold">
                  {sessionAal.toUpperCase()}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                Administrative roles and email bindings are strictly governed by platform security policies.
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                {onOpenChangePassword && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenChangePassword();
                    }}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 underline font-medium"
                  >
                    Change Password
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Profile Details
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: Photo Studio & Cropper */}
        {activeTab === 'photo' && (
          <div className="space-y-4">
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            {!imageSrc ? (
              /* No Image Selected: Upload / Preview Screen */
              <div className="p-6 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/30">
                <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-emerald-500/30 bg-slate-800 shrink-0 flex items-center justify-center text-2xl font-bold text-emerald-400 shadow-xl mb-4">
                  {currentAdmin?.avatarUrl ? (
                    <img
                      src={currentAdmin.avatarUrl}
                      alt={currentAdmin.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(currentAdmin?.fullName)
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {currentAdmin?.avatarUrl ? 'Update Profile Photo' : 'Add Your Profile Photo'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4">
                  Upload a photo to represent your administrative account across the VISTAAR Super Admin control plane.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Image File
                  </button>

                  {currentAdmin?.avatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={isSubmitting}
                      className="px-3.5 py-2 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Current Photo
                    </button>
                  )}
                </div>

                <div className="mt-5 text-[11px] text-slate-400 space-y-1">
                  <div>Supported Formats: <strong className="text-slate-300">PNG, JPEG, WebP</strong></div>
                  <div>Maximum File Size: <strong className="text-slate-300">5.00 MB</strong></div>
                  <div>Recommended Dimensions: <strong className="text-slate-300">512 × 512 pixels</strong></div>
                </div>
              </div>
            ) : (
              /* Image Selected: Interactive Circular Cropper */
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Crop className="w-4 h-4 text-emerald-400" />
                    Crop & Position Your Photo
                  </span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    Choose Different Photo
                  </button>
                </div>

                {/* Canvas Cropper Box */}
                <div
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="relative w-full h-72 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden cursor-move select-none shadow-inner"
                  title="Click and drag to reposition image"
                >
                  <canvas
                    ref={canvasRef}
                    className="w-56 h-56 rounded-full border-2 border-emerald-500/80 shadow-2xl pointer-events-none"
                  />
                  <div className="absolute bottom-2 left-3 text-[10px] text-slate-500 font-mono flex items-center gap-1 pointer-events-none">
                    <Sliders className="w-3 h-3 text-slate-400" />
                    Drag to reposition
                  </div>
                </div>

                {/* Cropper Controls (Zoom & Reset) */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    <ZoomOut className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-slate-300 dark:bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <ZoomIn className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] font-mono text-slate-500 w-10 text-right">
                      {zoom.toFixed(1)}x
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1"
                    title="Reset position and zoom"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>

                {/* Cropper Actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={resetCropper}
                    className="px-3.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePhoto}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Apply & Save Photo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

