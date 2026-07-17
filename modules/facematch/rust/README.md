# Rust Facematch Lib

## Download Models

From the project root, run:

```sh
scripts/download-facematch-models.sh
```

This will download the models to `modules/facematch/ios/models/arcface.ort` and `modules/facematch/ios/models/scrfd_2.5g_bnkps.ort`.

## Run Tests

From the folder `modules/facematch/rust`, run:

```sh
cargo test -- --show-output
```
