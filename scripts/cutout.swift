// Background removal with Apple Vision (macOS 14+): keeps the foreground
// instances, writes a PNG with alpha. Usage: cutout <in.jpg> <out.png>
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else { fputs("usage: cutout in out.png\n", stderr); exit(2) }
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
guard let ci = CIImage(contentsOf: inURL, options: [.applyOrientationProperty: true]) else {
  fputs("cannot read \(args[1])\n", stderr); exit(1)
}
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: ci, options: [:])
try handler.perform([request])
guard let result = request.results?.first else { fputs("no foreground found\n", stderr); exit(3) }
let maskBuffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
var mask = CIImage(cvPixelBuffer: maskBuffer)
// Mask is returned at the handler's pixel size; scale to match the source.
let sx = ci.extent.width / mask.extent.width, sy = ci.extent.height / mask.extent.height
mask = mask.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
let blend = CIFilter(name: "CIBlendWithMask")!
blend.setValue(ci, forKey: kCIInputImageKey)
blend.setValue(CIImage(color: .clear).cropped(to: ci.extent), forKey: kCIInputBackgroundImageKey)
blend.setValue(mask, forKey: kCIInputMaskImageKey)
let out = blend.outputImage!.cropped(to: ci.extent)
let ctx = CIContext()
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
try ctx.writePNGRepresentation(of: out, to: outURL, format: .RGBA8, colorSpace: cs, options: [:])
print("ok \(Int(ci.extent.width))x\(Int(ci.extent.height))")
