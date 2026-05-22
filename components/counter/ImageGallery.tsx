"use client";

interface MatchedImage {
  label: string;
  objectUrl: string;
}

interface Props {
  images: MatchedImage[];
}

export default function ImageGallery({ images }: Props) {
  if (images.length === 0) {
    return (
      <div className="ct-gallery-empty">
        no images matched — upload the corresponding image files
      </div>
    );
  }

  return (
    <div className="ct-gallery">
      {images.map((img, i) => (
        <div key={i} className="ct-gallery-item">
          <img src={img.objectUrl} alt={img.label} title={img.label} className="ct-gallery-img" />
          <span className="ct-gallery-label">{img.label}</span>
        </div>
      ))}
    </div>
  );
}