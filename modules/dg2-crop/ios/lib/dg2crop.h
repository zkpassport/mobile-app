#ifndef DG2CROP_H
#define DG2CROP_H

#include <stdint.h>

// Trim white border from a base64-encoded image
// Returns a JSON string with either {"result": "base64..."} or {"error": "..."}
char* trim_dg2_base64(const char* base64_input, uint8_t tolerance);

// Free a string returned by the Rust library
void rust_string_free(char* s);

#endif // DG2CROP_H
