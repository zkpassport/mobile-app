//
//  NativeOperationsModule.m
//  NativeOperations
//
//  Created by Theo Madzou on 29/01/2025.
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeOperationsModule, NSObject)

RCT_EXTERN_METHOD(computeMerkleProof:(NSArray)leaves
                  index:(NSInteger)index
                  height:(NSInteger)height
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}


@end
