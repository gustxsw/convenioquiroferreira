import React, { useState, useRef, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  Upload,
  X,
  Check,
  AlertCircle,
  FileImage,
  Trash2,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";
import {
  SIGNATURE_ASPECT,
  SIGNATURE_EXPORT_HEIGHT,
  SIGNATURE_EXPORT_WIDTH,
} from "../constants/signatureDisplay";
import { getSignaturePngBlob } from "../utils/signatureCrop";

type UploadSignatureModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentSignatureUrl?: string | null;
};

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

const UploadSignatureModal: React.FC<UploadSignatureModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentSignatureUrl,
}) => {
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokeCropUrl = useCallback(() => {
    if (cropImageSrc && cropImageSrc.startsWith("blob:")) {
      URL.revokeObjectURL(cropImageSrc);
    }
  }, [cropImageSrc]);

  const clearCropState = useCallback(() => {
    revokeCropUrl();
    setCropImageSrc(null);
    setSourceFileName("");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [revokeCropUrl]);

  useEffect(() => {
    if (!isOpen) {
      clearCropState();
      setError("");
      setSuccess("");
    }
  }, [isOpen, clearCropState]);

  const onCropComplete = useCallback(
    (_area: Area, areaPixels: Area) => {
      setCroppedAreaPixels(areaPixels);
    },
    []
  );

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    if (!file.type.startsWith("image/")) {
      setError(
        "Por favor, selecione apenas arquivos de imagem (PNG, JPEG, JPG)"
      );
      return;
    }

    if (file.size > MAX_SIGNATURE_BYTES) {
      setError("A imagem deve ter no máximo 2MB");
      return;
    }

    revokeCropUrl();
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    setSourceFileName(file.name);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const handleUpload = async () => {
    if (!cropImageSrc || !croppedAreaPixels) {
      setError("Ajuste o recorte e tente novamente");
      return;
    }

    try {
      setIsUploading(true);
      setError("");
      setSuccess("");

      const blob = await getSignaturePngBlob(cropImageSrc, croppedAreaPixels);
      if (blob.size > MAX_SIGNATURE_BYTES) {
        throw new Error(
          "A imagem processada excedeu 2MB. Tente uma foto menor ou mais zoom."
        );
      }

      const apiUrl = getApiUrl();
      const userData = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = userData.id;

      if (!userId) {
        throw new Error("Usuário não identificado");
      }

      const formData = new FormData();
      formData.append("signature", blob, "assinatura.png");

      const response = await fetchWithAuth(
        `${apiUrl}/api/professionals/${userId}/signature`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Erro ao fazer upload da assinatura"
        );
      }

      setSuccess("Assinatura digital salva com sucesso!");

      setTimeout(() => {
        clearCropState();
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error uploading signature:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao fazer upload da assinatura"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const removeCurrentSignature = async () => {
    if (!currentSignatureUrl) return;

    try {
      setIsUploading(true);
      setError("");
      setSuccess("");

      const apiUrl = getApiUrl();
      const userData = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = userData.id;

      const response = await fetchWithAuth(
        `${apiUrl}/api/professionals/${userId}/signature`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao remover assinatura");
      }

      setSuccess("Assinatura removida com sucesso!");

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error removing signature:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao remover assinatura"
      );
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const showCurrentOnly =
    Boolean(currentSignatureUrl) && !cropImageSrc && !isUploading;
  const showInitialUpload = !currentSignatureUrl && !cropImageSrc;
  const showCropStep = Boolean(cropImageSrc);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center">
              <FileImage className="h-6 w-6 text-red-600 mr-2" />
              {currentSignatureUrl
                ? "Gerenciar Assinatura Digital"
                : "Upload de Assinatura Digital"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isUploading}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 bg-green-50 text-green-600 p-3 rounded-lg flex items-center">
            <Check className="h-5 w-5 mr-2 flex-shrink-0" />
            {success}
          </div>
        )}

        <div className="p-6">
          {showCurrentOnly && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Assinatura Atual
              </h3>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="text-center">
                  <div className="inline-block bg-white mx-auto mb-4">
                    <img
                      src={currentSignatureUrl ?? ""}
                      alt="Assinatura atual"
                      className="block mx-auto object-contain max-w-[280px] max-h-[94px]"
                    />
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Esta é sua assinatura digital atual
                  </p>
                  <div className="flex justify-center space-x-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-primary flex items-center"
                      disabled={isUploading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Alterar Assinatura
                    </button>
                    <button
                      type="button"
                      onClick={removeCurrentSignature}
                      className="btn bg-red-600 text-white hover:bg-red-700 flex items-center"
                      disabled={isUploading}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remover Assinatura
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showInitialUpload && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Selecionar imagem
              </h3>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    fileInputRef.current?.click();
                }}
                onClick={() => fileInputRef.current?.click()}
                className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-red-400 hover:bg-red-50 transition-colors"
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Clique para selecionar uma foto da sua assinatura
                </p>
                <p className="text-sm text-gray-500">
                  PNG, JPEG ou JPG — até 2 MB. Na etapa seguinte você recorta a
                  área da assinatura.
                </p>
              </div>
            </div>
          )}

          {showCropStep && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Recortar assinatura
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Posicione o retângulo sobre a assinatura (proporção{" "}
                {SIGNATURE_ASPECT.toFixed(0)}:1). Só essa área será usada; o
                arquivo final terá fundo branco ({SIGNATURE_EXPORT_WIDTH}×
                {SIGNATURE_EXPORT_HEIGHT}px).
              </p>
              {sourceFileName && (
                <p className="text-xs text-gray-500 mb-2">
                  Arquivo: {sourceFileName}
                </p>
              )}
              <div className="relative w-full h-64 md:h-72 bg-neutral-100 rounded-lg overflow-hidden">
                <Cropper
                  image={cropImageSrc!}
                  crop={crop}
                  zoom={zoom}
                  aspect={SIGNATURE_ASPECT}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  showGrid={false}
                />
              </div>
              <div className="mt-4">
                <label
                  htmlFor="sig-zoom"
                  className="text-sm font-medium text-gray-700 block mb-1"
                >
                  Zoom
                </label>
                <input
                  id="sig-zoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex justify-center flex-wrap gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary flex items-center"
                  disabled={isUploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Outra imagem
                </button>
                <button
                  type="button"
                  onClick={clearCropState}
                  className="btn btn-outline flex items-center"
                  disabled={isUploading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar recorte
                </button>
              </div>
            </div>
          )}

          {!showCropStep && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-900 mb-2">
                Como a assinatura fica padronizada
              </h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>
                  • Você escolhe exatamente a região da assinatura no recorte
                </li>
                <li>
                  • O sistema gera um PNG com fundo branco no tamanho fixo usado
                  nos documentos
                </li>
                <li>• Use zoom na foto se a assinatura estiver pequena</li>
              </ul>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isUploading}
            >
              Fechar
            </button>

            {showCropStep && (
              <button
                type="button"
                onClick={handleUpload}
                className={`btn btn-primary flex items-center ${
                  isUploading ? "opacity-70 cursor-not-allowed" : ""
                }`}
                disabled={isUploading || !croppedAreaPixels}
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Salvar Assinatura
                  </>
                )}
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
        </div>

        {isUploading && (
          <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center rounded-xl z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4" />
              <p className="text-gray-700 font-medium">
                Processando assinatura...
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Gerando PNG e enviando
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadSignatureModal;
