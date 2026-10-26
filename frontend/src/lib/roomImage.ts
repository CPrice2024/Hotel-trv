const optimizedRoomImages: Record<string, string> = {
  "https://ayeledeguinthotel.com/admin/uploads/photos/1787959202_6a9217a2d4ba9.jpg":
    "/images/rooms/standard-room.webp",
  "https://ayeledeguinthotel.com/admin/uploads/photos/1787959527_6a9218e75125d.jpg":
    "/images/rooms/twin-room.webp",
  "https://ayeledeguinthotel.com/admin/uploads/photos/1787960514_6a921cc2760e1.jpg":
    "/images/rooms/deluxe-room.webp",
  "https://ayeledeguinthotel.com/admin/uploads/photos/1776632915_69e54453158c0.JPG":
    "/images/rooms/suite-room.webp",
};

export function getRoomImageUrl(imageUrl: string): string {
  return optimizedRoomImages[imageUrl] ?? imageUrl;
}
