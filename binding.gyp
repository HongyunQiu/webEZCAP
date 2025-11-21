{
  "targets": [
    {
      "target_name": "qhyccd_addon",
      "sources": [
        "src/qhyccd_addon.cpp",
        "src/qhyccd_dynamic.cpp"
      ],
      "include_dirs": [
        "src"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [
            "/utf-8"
          ]
        }
      },
      "libraries": [
        "<(module_root_dir)/sdk/x64/qhyccd.lib"
      ],
      "defines": [
        "_WIN32",
        "__CPP_MODE__=1"
      ]
    }
  ]
}


