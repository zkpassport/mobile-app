//
//  MrzScannerModule.m
//  OpenPassport
//
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MrzScannerModule, NSObject)

RCT_EXTERN_METHOD(scan:(NSDictionary *)options resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
