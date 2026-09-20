#ifndef ASCIIART_H
#define ASCIIART_H

typedef unsigned char       u_char;
typedef unsigned short      u_short;
typedef unsigned long       u_long;
typedef unsigned short      Fi_Char;

#define PF_TABLE_BITS      8
#define PF_TABLE_SZ        (1 << PF_TABLE_BITS)
#define PF_MAX_TABLE_DEV   (PF_TABLE_SZ - 1)

#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "AE_EffectCBSuites.h"
#include "String_Utils.h"
#include "PT_Invert.h"
#include "AEGP_SuiteHandler.h"

#define MAJOR_VERSION   1
#define MINOR_VERSION   0
#define BUG_VERSION     0
#define STAGE_VERSION   PF_Stage_DEVELOP
#define BUILD_VERSION   1

enum {
    ASCII_INPUT = 0,

    // Resolution Options Group
    ASCII_RES_GROUP_START,
    ASCII_BLOCK_SIZE,            // Slider: 1 - 100, default 10
    ASCII_RES_GROUP_END,

    // Character Options Group
    ASCII_CHAR_GROUP_START,
    ASCII_CHAR_SIZE,             // Float slider: 0.1 - 5.0, default 1.30
    ASCII_TEXT_PATTERN,          // Popup: Pattern 1, Pattern 2, Binary, Blocks, Custom
    ASCII_REVERSE_PATTERN,       // Checkbox: Reverse text pattern
    ASCII_LETTER_SIZE_BRIGHTNESS,// Checkbox: Letter Size based on brig
    ASCII_CHAR_GROUP_END,

    // Color Options Group
    ASCII_COLOR_GROUP_START,
    ASCII_ORIGINAL_COLOR,        // Checkbox: Original Color
    ASCII_CUSTOM_COLOR_START,    // Color picker: Custom Color Start
    ASCII_CUSTOM_COLOR_END,      // Color picker: Custom Color End
    ASCII_BACKGROUND_COLOR,      // Color picker: Background Color
    ASCII_TRANSPARENT_BG,        // Checkbox: Transparent Background
    ASCII_COLOR_GROUP_END,

    ASCII_NUM_PARAMS
};

enum {
    PATTERN_1 = 1,
    PATTERN_2,
    PATTERN_BINARY,
    PATTERN_BLOCKS,
    PATTERN_SIMPLE,
    PATTERN_GBA
};

typedef struct {
    PF_FpLong block_size;
    PF_FpLong char_size;
    A_long    text_pattern;
    PF_Boolean reverse_pattern;
    PF_Boolean size_by_brightness;
    PF_Boolean original_color;
    PF_Pixel   color_start;
    PF_Pixel   color_end;
    PF_Pixel   bg_color;
    PF_Boolean transparent_bg;
} ASCIIArtRenderParams;

#ifdef __cplusplus
extern "C" {
#endif

DllExport PF_Err EntryPointFunc(
    PF_Cmd          cmd,
    PF_InData       *in_data,
    PF_OutData      *out_data,
    PF_ParamDef     *params[],
    PF_LayerDef     *output,
    void            *extra);

#ifdef __cplusplus
}
#endif

#endif // ASCIIART_H
